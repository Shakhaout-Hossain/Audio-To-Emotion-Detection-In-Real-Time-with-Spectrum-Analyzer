/* AudioRecorder.js: Handles audio recording, websocket connection, and audio merging */
class AudioRecorder {
  constructor(options) {
    this.chunkTimeInput = document.getElementById(options.chunkTimeId);
    this.startBtn = document.getElementById(options.startBtnId);
    this.stopBtn = document.getElementById(options.stopBtnId);
    this.statusEl = document.getElementById(options.statusId);
    this.resultsContainer = document.getElementById(options.resultsContainerId);
    this.audioElement = document.getElementById(options.audioId);
    this.emotionChart = options.emotionChart; // Instance of EmotionChart

    this.wsClient = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.isRecording = false;
    this.segmentDuration = 5000;
    this.td = 0;
    this.sd = 5;
    this.audioChunks = [];
    this.segmentEmotion = {};
  }

  initWebSocket() {
    // Create a new WebSocketClient with a callback to handle incoming messages
    this.wsClient = new WebSocketClient(
      //"ws://localhost:8000/ws/audio",
      "wss://emote-live.ergov.com/ws/audio",
      (event) => {
        let data = JSON.parse(event.data);
        if (this.resultsContainer.textContent.includes("No results yet")) {
          this.resultsContainer.textContent = "";
        }
        const para = document.createElement("p");
        para.textContent = `Chunk: ${this.td}sec to ${
          this.td + this.sd
        }sec - Result: ${data.result}`;
        this.segmentEmotion[this.td] = data.result;
        this.td += this.sd;
        switch (data.result.toLowerCase()) {
          case "neutral":
            para.style.color = "#9CA3AF";
            break;
          case "calm":
            para.style.color = "#3B82F6";
            break;
          case "happy":
            para.style.color = "#FCD34D";
            break;
          case "sad":
            para.style.color = "#6B7280";
            break;
          case "angry":
            para.style.color = "#EF4444";
            break;
          case "fear":
            para.style.color = "#7C3AED";
            break;
          case "disgust":
            para.style.color = "#10B981";
            break;
          case "surprise":
            para.style.color = "#F59E0B";
            break;
          default:
            para.style.color = "red";
        }
        this.resultsContainer.appendChild(para);
        this.resultsContainer.scrollTop = this.resultsContainer.scrollHeight;
        this.emotionChart.increaseData(data.result, 1);
      }
    );
  }

  startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.audioChunks = [];
    this.td = 0;
    this.segmentDuration = parseInt(this.chunkTimeInput.value) || 5000;
    this.sd = this.segmentDuration / 1000;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.audioStream = stream;
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm; codecs=opus",
        });
        this.mediaRecorder.ondataavailable = async (event) => {
          if (
            event.data.size > 0 &&
            this.wsClient &&
            this.wsClient.socket.readyState === WebSocket.OPEN
          ) {
            const arrayBuffer = await event.data.arrayBuffer();
            this.wsClient.send(arrayBuffer);
          }
          this.audioChunks.push(event.data);
        };
        const recordSegment = () => {
          if (!this.isRecording) return;
          this.mediaRecorder.start();
          setTimeout(() => {
            this.mediaRecorder.stop();
            setTimeout(recordSegment, 200);
          }, this.segmentDuration);
        };
        this.initWebSocket();
        recordSegment();
        this.statusEl.textContent = `Recording with chunk time: ${this.segmentDuration}ms`;
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        if (window.audioVisualizer) {
          window.audioVisualizer.start();
        }
      })
      .catch((error) => {
        console.error("Microphone access denied:", error);
      });
  }

  stopRecording() {
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
    }
    this.statusEl.textContent = "Recording stopped.";
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    if (window.audioVisualizer) {
      window.audioVisualizer.stop();
    }
    if (this.audioChunks.length > 0) {
      AudioUtils.mergeAndExportAudio(this.audioChunks).then((wavBlob) => {
        if (wavBlob) {
          const audioUrl = URL.createObjectURL(wavBlob);
          this.audioElement.src = audioUrl;
          if (window.audioVisualizer) {
            window.audioVisualizer.setupAudioContext();
          }
        }
        this.audioChunks = [];
      });
    }
  }
}
