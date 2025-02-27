//Extract audio data and format parameters from each chunk

function parseWav(buffer) {
  // Add validation
  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error("Input must be an ArrayBuffer");
  }
  const view = new DataView(buffer);
  if (readString(view, 0, 4) !== "RIFF")
    throw new Error("Invalid WAV: Missing RIFF");
  if (readString(view, 8, 4) !== "WAVE")
    throw new Error("Invalid WAV: Missing WAVE");

  let fmt, data;
  let offset = 12;

  while (offset < view.byteLength) {
    const chunkId = readString(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: view.getUint16(offset + 8, true),
        numChannels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
        blockAlign: view.getUint16(offset + 20, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    } else if (chunkId === "data") {
      data = new Uint8Array(buffer.slice(offset + 8, offset + 8 + chunkSize));
    }

    offset += chunkSize + 8;
  }

  if (!fmt || !data) throw new Error("Invalid WAV: Missing fmt/data chunk");
  return { fmt, data };
}

function readString(view, offset, length) {
  return String.fromCharCode(...new Uint8Array(view.buffer, offset, length));
}

//Combine audio data and generate a new WAV header

function createWavHeader(fmt, dataLength) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk size (16 for PCM)
  view.setUint16(20, fmt.audioFormat, true);
  view.setUint16(22, fmt.numChannels, true);
  view.setUint32(24, fmt.sampleRate, true);
  view.setUint32(28, fmt.byteRate, true);
  view.setUint16(32, fmt.blockAlign, true);
  view.setUint16(34, fmt.bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  return new Uint8Array(header);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

async function mergeWavChunks(chunks) {
  let fmt;
  const dataArrays = [];
  let totalDataLength = 0;

  // Validate and extract data
  for (const chunk of chunks) {
    // Convert to ArrayBuffer if needed
    const buffer =
      chunk instanceof ArrayBuffer ? chunk : await chunk.arrayBuffer();
    const parsed = parseWav(buffer);
    if (!fmt) fmt = parsed.fmt;
    else if (!isSameFormat(fmt, parsed.fmt))
      throw new Error("Incompatible WAV formats");

    dataArrays.push(parsed.data);
    totalDataLength += parsed.data.length;
  }

  // Generate merged WAV
  const header = createWavHeader(fmt, totalDataLength);
  const merged = new Uint8Array(header.length + totalDataLength);
  merged.set(header);

  let offset = header.length;
  dataArrays.forEach((data) => {
    merged.set(data, offset);
    offset += data.length;
  });

  return merged.buffer;
}

function isSameFormat(a, b) {
  return (
    a.audioFormat === b.audioFormat &&
    a.numChannels === b.numChannels &&
    a.sampleRate === b.sampleRate &&
    a.bitsPerSample === b.bitsPerSample
  );
}

//Convert merged data to a playable URL

// async function mergeAndPlay(chunksArray) {
//     try {
//       const { format, mergedData } = mergeChunks(chunksArray);
//       const header = generateWavHeader(format, mergedData.length);
//       const mergedWav = new Uint8Array(header.length + mergedData.length);
//       mergedWav.set(header);
//       mergedWav.set(mergedData, header.length);

//       // Create playable URL
//       const blob = new Blob([mergedWav], { type: 'audio/wav' });
//       const url = URL.createObjectURL(blob);

//       // Load into audio element
//       const audioPlayer = document.getElementById('audioPlayer');
//       audioPlayer.src = url;
//       audioPlayer.play();
//     } catch (error) {
//       console.error("Merge failed:", error);
//     }
//   }

async function playMergedAudio(chunks) {
  try {
    const mergedBuffer = await mergeWavChunks(chunks);
    const blob = new Blob([mergedBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);

    const audioPlayer = document.getElementById("audioPlayer");
    audioPlayer.src = url;

    // Cleanup memory after playback
    audioPlayer.onended = () => URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error:", error);
  }
}
