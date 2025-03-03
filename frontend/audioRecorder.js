// audioRecorder.js
export class AudioRecorder {
    constructor() {
      this.mediaRecorder = null;
      this.audioStream = null;
      this.audioChunks = [];
      this.isRecording = false;
      this.td = 0;
      this.sd = 5;
      this.segmentEmotion = {};
      this.wsAudio = null;
    }
  
    async start() {
      if (this.isRecording) return;
      this.isRecording = true;
      this.audioChunks = [];
      this.sd = parseInt(document.getElementById('chunkTime').value || 5000) / 1000;
  
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(this.audioStream, { 
          mimeType: 'audio/webm; codecs=opus' 
        });
  
        this.mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && this.wsAudio?.readyState === WebSocket.OPEN) {
            this.wsAudio.send(await event.data.arrayBuffer());
          }
          this.audioChunks.push(event.data);
        };
  
        this.connectWebSocket();
        this.recordSegment();
        this.updateStatus(`Recording with chunk time: ${this.sd * 1000}ms`);
        this.toggleButtons(true);
      } catch (error) {
        console.error("Microphone access denied:", error);
        this.isRecording = false;
      }
    }
  
    connectWebSocket() {
      this.wsAudio = new WebSocket('ws://localhost:8000/ws/audio');
      this.wsAudio.onmessage = (event) => this.handleMessage(event);
    }
  
    handleMessage(event) {
      const data = JSON.parse(event.data);
      const resultsContainer = document.getElementById('results');
      if (resultsContainer.textContent.includes("No results yet")) {
        resultsContainer.textContent = "";
      }
  
      const para = document.createElement('p');
      para.textContent = `Chunk: ${this.td}sec to ${this.td + this.sd}sec - Result: ${data.result}`;
      this.segmentEmotion[this.td] = data.result;
      this.td += this.sd;
  
      const colorMap = {
        neutral: '#9CA3AF', calm: '#3B82F6', happy: '#FCD34D',
        sad: '#6B7280', angry: '#EF4444', fear: '#7C3AED',
        disgust: '#10B981', surprise: '#F59E0B'
      };
      para.style.color = colorMap[data.result.toLowerCase()] || 'red';
      resultsContainer.appendChild(para);
      resultsContainer.scrollTop = resultsContainer.scrollHeight;
    }
  
    async stop() {
      this.isRecording = false;
      this.mediaRecorder?.stop();
      this.audioStream?.getTracks().forEach(track => track.stop());
      this.updateStatus("Recording stopped.");
      this.toggleButtons(false);
      this.wsAudio?.close();
  
      if (this.audioChunks.length > 0) {
        const wavBlob = await this.mergeAndExportAudio(this.audioChunks);
        const audioUrl = URL.createObjectURL(wavBlob);
        document.getElementById('audio').src = audioUrl;
      }
    }
  
    async mergeAndExportAudio(chunks) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const decodedBuffers = await Promise.all(chunks.map(async chunk => {
        const arrayBuffer = await chunk.arrayBuffer();
        return audioContext.decodeAudioData(arrayBuffer);
      });
  
      const mergedBuffer = audioContext.createBuffer(
        decodedBuffers[0].numberOfChannels,
        decodedBuffers.reduce((sum, buf) => sum + buf.length, 0),
        decodedBuffers[0].sampleRate
      );
  
      for (let channel = 0; channel < mergedBuffer.numberOfChannels; channel++) {
        let offset = 0;
        decodedBuffers.forEach(buffer => {
          mergedBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
          offset += buffer.length;
        });
      }
      return this.bufferToWav(mergedBuffer);
    }
  
    bufferToWav(buffer) {
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

        writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, "WAVE");
        writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numOfChan, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, "data");
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
  
    recordSegment() {
      if (!this.isRecording) return;
      this.mediaRecorder.start();
      setTimeout(() => {
        this.mediaRecorder.stop();
        setTimeout(() => this.recordSegment(), 200);
      }, this.sd * 1000);
    }
  
    toggleButtons(recording) {
      document.getElementById('startBtn').disabled = recording;
      document.getElementById('stopBtn').disabled = !recording;
    }
  
    updateStatus(message) {
      document.getElementById('status').textContent = message;
    }
  }