/* main.js: Initialize all modules and attach event listeners */
document.addEventListener("DOMContentLoaded", function () {
  const emotionChart = new EmotionChart("emotionChartLoad");

  window.audioRecorder = new AudioRecorder({
    chunkTimeId: "chunkTime",
    startBtnId: "startBtn",
    stopBtnId: "stopBtn",
    statusId: "status",
    resultsContainerId: "results",
    audioId: "audio",
    emotionChart: emotionChart,
  });

  window.audioVisualizer = new AudioVisualizer({
    oscilloscopeId: "oscilloscope",
    realTimeSpectrumId: "realTimeSpectrum",
    waveformCanvasId: "waveform",
    spectrumContainerId: "spectrum-container",
    audioId: "audio",
  });

  document.getElementById("startBtn").addEventListener("click", () => {
    window.audioRecorder.startRecording();
  });

  document.getElementById("stopBtn").addEventListener("click", () => {
    window.audioRecorder.stopRecording();
  });
});
