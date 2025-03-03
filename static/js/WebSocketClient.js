/* WebSocketClient.js: Handles the WebSocket connection */
class WebSocketClient {
  constructor(url, onMessageCallback) {
    this.url = url;
    this.onMessageCallback = onMessageCallback;
    this.connect();
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = (event) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(event);
      }
    };
    this.socket.onopen = () => {
      console.log("WebSocket connection opened");
    };
    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    this.socket.onclose = () => {
      console.log("WebSocket connection closed");
    };
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      console.error("WebSocket is not open. Cannot send data.");
    }
  }
}
