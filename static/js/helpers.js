/* helpers.js: Utility functions for merging and exporting audio */
class AudioUtils {
  static async mergeAndExportAudio(chunks) {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const decodedBuffers = [];
    for (const chunk of chunks) {
      const arrayBuffer = await chunk.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      decodedBuffers.push(audioBuffer);
    }
    if (decodedBuffers.length === 0) {
      return null;
    }
    const sampleRate = decodedBuffers[0].sampleRate;
    const numberOfChannels = decodedBuffers[0].numberOfChannels;
    const totalLength = decodedBuffers.reduce(
      (sum, buffer) => sum + buffer.length,
      0
    );
    const mergedBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );
    for (let channel = 0; channel < numberOfChannels; channel++) {
      let offset = 0;
      for (const buffer of decodedBuffers) {
        mergedBuffer
          .getChannelData(channel)
          .set(buffer.getChannelData(channel), offset);
        offset += buffer.length;
      }
    }
    const wavBlob = AudioUtils.bufferToWav(mergedBuffer);
    return wavBlob;
  }

  static bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const numSamples = buffer.length;
    const blockAlign = (numOfChan * bitDepth) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const bufferLength = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    AudioUtils.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    AudioUtils.writeString(view, 8, "WAVE");
    AudioUtils.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    AudioUtils.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    if (numOfChan === 2) {
      const channel0 = buffer.getChannelData(0);
      const channel1 = buffer.getChannelData(1);
      for (let i = 0; i < numSamples; i++) {
        let sample = Math.max(-1, Math.min(1, channel0[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
        sample = Math.max(-1, Math.min(1, channel1[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    } else {
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        let sample = Math.max(-1, Math.min(1, channelData[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  static writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
