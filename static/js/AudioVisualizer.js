/* AudioVisualizer.js: Handles spectrum and waveform visualization */
class AudioVisualizer {
  constructor(options) {
    this.oscilloscope = document.getElementById(options.oscilloscopeId);
    this.realTimeSpectrum = document.getElementById(options.realTimeSpectrumId);
    this.waveformCanvas = document.getElementById(options.waveformCanvasId);
    this.spectrumContainer = document.getElementById(
      options.spectrumContainerId
    );
    this.audioElement = document.getElementById(options.audioId);

    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.audioProcessorNode = null;
    this.isMicrophoneActive = false;
    this.fftSize = 2048;
    this.bufferLength = this.fftSize;
    this.dataArray = new Float32Array(this.bufferLength);
    this.magnitudeArray = new Float32Array(this.bufferLength / 2);

    this.audioCtx = null;
    this.analyserSpectrum = null;
    this.waveformAnalyser = null;
    this.source = null;
    this.bufferLengthSpectrum = null;
    this.dataArraySpectrum = null;
    this.waveformArray = null;
    this.segmentInterval = 5;
    this.segments = [];
    this.timeoutId = null;
  }

  start() {
    if (this.isMicrophoneActive) return;
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const processorCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          static get parameterDescriptors() { return []; }
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              this.port.postMessage(input[0][0]);
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `;
    const blob = new Blob([processorCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.audioContext.audioWorklet.addModule(url).then(() => {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = this.fftSize;
          this.microphone = this.audioContext.createMediaStreamSource(stream);
          this.audioProcessorNode = new AudioWorkletNode(
            this.audioContext,
            "audio-processor"
          );
          this.microphone.connect(this.analyser);
          this.analyser
            .connect(this.audioProcessorNode)
            .connect(this.audioContext.destination);
          this.audioProcessorNode.port.onmessage = () => {
            this.analyser.getFloatTimeDomainData(this.dataArray);
            this.analyser.getFloatFrequencyData(this.magnitudeArray);
            this.drawOscilloscope();
          };
        })
        .catch((err) => {
          console.error("Error accessing the microphone", err);
        });
      this.audioContext.resume();
      this.isMicrophoneActive = true;
    });
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.isMicrophoneActive = false;
    }
  }

  drawOscilloscope() {
    const canvasCtx = this.oscilloscope.getContext("2d");
    canvasCtx.clearRect(
      0,
      0,
      this.oscilloscope.width,
      this.oscilloscope.height
    );
    canvasCtx.beginPath();
    const sliceWidth = this.oscilloscope.width / this.bufferLength;
    let x = 0;
    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.dataArray[i] * 200.0;
      const y = this.oscilloscope.height / 2 + v;
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    canvasCtx.lineTo(this.oscilloscope.width, this.oscilloscope.height / 2);
    canvasCtx.stroke();
  }

  setupAudioContext() {
    if (this.audioCtx) this.audioCtx.close();
    this.segmentInterval = window.audioRecorder ? window.audioRecorder.sd : 5;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyserSpectrum = this.audioCtx.createAnalyser();
    this.analyserSpectrum.fftSize = 512;
    this.bufferLengthSpectrum = this.analyserSpectrum.frequencyBinCount;
    this.dataArraySpectrum = new Uint8Array(this.bufferLengthSpectrum);
    this.waveformAnalyser = this.audioCtx.createAnalyser();
    this.waveformAnalyser.fftSize = 2048;
    this.waveformArray = new Uint8Array(
      this.waveformAnalyser.frequencyBinCount
    );
    this.source = this.audioCtx.createMediaElementSource(this.audioElement);
    this.source.connect(this.analyserSpectrum);
    this.source.connect(this.waveformAnalyser);
    this.analyserSpectrum.connect(this.audioCtx.destination);
    this.spectrumContainer.innerHTML = "";
    this.segments = [];
    this.audioElement.addEventListener("play", () =>
      this.scheduleNextSegment()
    );
    this.audioElement.addEventListener("seeked", () => {
      if (!this.audioElement.paused) this.scheduleNextSegment();
    });
    requestAnimationFrame(() => this.drawWaveform());
    requestAnimationFrame(() => this.drawRealTimeSpectrum());
    requestAnimationFrame(() => this.updateActiveSegment());
  }

  scheduleNextSegment() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    const currentTime = this.audioElement.currentTime;
    const nextSegmentEnd =
      Math.floor(currentTime / this.segmentInterval + 1) * this.segmentInterval;
    const timeUntilNext = (nextSegmentEnd - currentTime) * 1000;
    this.timeoutId = setTimeout(() => {
      if (!this.audioElement.paused && !this.audioElement.ended) {
        const segmentStart = nextSegmentEnd - this.segmentInterval;
        if (segmentStart >= 0) {
          this.captureSegment(segmentStart);
        }
        this.scheduleNextSegment();
      }
    }, Math.max(0, timeUntilNext));
  }

  captureSegment(segmentStart) {
    this.analyserSpectrum.getByteFrequencyData(this.dataArraySpectrum);
    if (
      !this.segments.some((s) => s.dataset.start === segmentStart.toString())
    ) {
      this.renderSegment(new Uint8Array(this.dataArraySpectrum), segmentStart);
      this.spectrumContainer.scrollLeft = this.spectrumContainer.scrollWidth;
    }
  }

  renderSegment(segmentData, segmentStart) {
    const segmentDiv = document.createElement("div");
    segmentDiv.className = "segment";
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 120;
    const timestampLabel = document.createElement("div");
    timestampLabel.className = "timestamp";
    const emotion = window.audioRecorder
      ? window.audioRecorder.segmentEmotion[segmentStart]
      : "";
    timestampLabel.textContent = `${this.formatTime(
      segmentStart
    )} - ${this.formatTime(segmentStart + this.segmentInterval)} ${emotion}`;
    segmentDiv.appendChild(canvas);
    segmentDiv.appendChild(timestampLabel);
    segmentDiv.dataset.start = segmentStart;
    segmentDiv.addEventListener("click", () => {
      this.audioElement.currentTime = segmentStart;
    });
    this.spectrumContainer.appendChild(segmentDiv);
    this.segments.push(segmentDiv);
    this.drawSpectrum(canvas, segmentData);
  }

  drawSpectrum(canvas, segmentData) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / this.bufferLengthSpectrum) * 2.5;
    let x = 0;
    for (let i = 0; i < this.bufferLengthSpectrum; i++) {
      const barHeight = segmentData[i] / 2;
      ctx.fillStyle = `hsl(${(i * 360) / this.bufferLengthSpectrum}, 70%, 60%)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  drawRealTimeSpectrum() {
    requestAnimationFrame(() => this.drawRealTimeSpectrum());
    this.analyserSpectrum.getByteFrequencyData(this.dataArraySpectrum);
    const spectrumCtx = this.realTimeSpectrum.getContext("2d");
    spectrumCtx.clearRect(
      0,
      0,
      this.realTimeSpectrum.width,
      this.realTimeSpectrum.height
    );
    this.realTimeSpectrum.width = window.innerWidth * 0.8;
    const barWidth =
      (this.realTimeSpectrum.width / this.bufferLengthSpectrum) * 2.5;
    let x = 0;
    for (let i = 0; i < this.bufferLengthSpectrum; i++) {
      const barHeight =
        (this.dataArraySpectrum[i] / 255) * this.realTimeSpectrum.height;
      spectrumCtx.fillStyle = `hsl(${
        (i * 360) / this.bufferLengthSpectrum
      }, 100%, 60%)`;
      spectrumCtx.fillRect(
        x,
        this.realTimeSpectrum.height - barHeight,
        barWidth,
        barHeight
      );
      x += barWidth + 1;
    }
  }

  drawWaveform() {
    requestAnimationFrame(() => this.drawWaveform());
    this.waveformAnalyser.getByteTimeDomainData(this.waveformArray);
    const ctx = this.waveformCanvas.getContext("2d");
    this.waveformCanvas.width = window.innerWidth * 0.8;
    ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0ff";
    ctx.beginPath();
    let sliceWidth = this.waveformCanvas.width / this.waveformArray.length;
    let x = 0;
    for (let i = 0; i < this.waveformArray.length; i++) {
      const v = this.waveformArray[i] / 128.0;
      const y = (v * this.waveformCanvas.height) / 2;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();
  }

  updateActiveSegment() {
    requestAnimationFrame(() => this.updateActiveSegment());
    const currentTime = this.audioElement.currentTime;
    this.segments.forEach((segment) => {
      const start = parseFloat(segment.dataset.start);
      segment.classList.toggle(
        "active",
        currentTime >= start && currentTime < start + this.segmentInterval
      );
    });
  }

  formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }
}
