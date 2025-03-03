/* EmotionChart.js: Manages the emotion chart using Chart.js */
class EmotionChart {
  constructor(canvasId) {
    this.emotionsChart = {
      labels: [
        "Neutral",
        "Calm",
        "Happy",
        "Sad",
        "Angry",
        "Fear",
        "Disgust",
        "Surprise",
      ],
      labelToIndex: {
        Neutral: 0,
        Calm: 1,
        Happy: 2,
        Sad: 3,
        Angry: 4,
        Fear: 5,
        Disgust: 6,
        Surprise: 7,
      },
      data: [0, 0, 0, 0, 0, 0, 0, 0],
      colors: [
        "#9CA3AF",
        "#3B82F6",
        "#FCD34D",
        "#6B7280",
        "#EF4444",
        "#7C3AED",
        "#10B981",
        "#F59E0B",
      ],
    };
    this.chart = new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels: this.emotionsChart.labels,
        datasets: [
          {
            label: "Emotion Intensity",
            data: this.emotionsChart.data,
            backgroundColor: this.emotionsChart.colors,
            borderWidth: 2,
          },
        ],
      },
      options: {
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  increaseData(label, amount = 1) {
    const index = this.emotionsChart.labelToIndex[label];
    if (index !== undefined) {
      this.emotionsChart.data[index] += amount;
      this.chart.update();
    }
  }
}
