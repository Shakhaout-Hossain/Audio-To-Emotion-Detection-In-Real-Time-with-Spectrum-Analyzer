from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import asyncio
from fastapi.websockets import WebSocketState
from loadStatic import predict, static

app = FastAPI()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)  # Ensure the upload directory exists

# HTML page with recording that stops every 5 seconds to produce complete chunks.
html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Real-Time Audio Streaming</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; text-align: center; }
    #status { margin-bottom: 1rem; font-weight: bold; }
    #results { margin-top: 1rem; border: 1px solid #ccc; padding: 1rem; max-height: 300px; overflow-y: auto; background: #f9f9f9; text-align: left; }
    button { margin: 0.5rem; padding: 10px 20px; font-size: 16px; border: none; cursor: pointer; border-radius: 5px; }
    #startBtn { background-color: #28a745; color: white; }
    #stopBtn { background-color: #dc3545; color: white; }
    button:disabled { background-color: #ccc; cursor: not-allowed; }
  </style>
</head>
<body>
  <h1>Real-Time Audio Streaming</h1>
  <p id="status">Click "Start Recording" to begin streaming audio from your microphone.</p>
  <button id="startBtn">Start Recording</button>
  <button id="stopBtn" disabled>Stop Recording</button>
  
  <h2>Results:</h2>
  <div id="results">No results yet. Please start recording.</div>

  <script>
    let wsAudio;
    let mediaRecorder;
    let audioStream;
    let isRecording = false;
    const segmentDuration = 5000; // 5 seconds
    let reconnectAttempts = 0;
    const maxReconnects = 5;

    function connectWebSocket() {
      if (wsAudio && wsAudio.readyState === WebSocket.OPEN) return;

      wsAudio = new WebSocket("ws://localhost:8000/ws/audio");

      wsAudio.onopen = () => {
        console.log("Connected to WebSocket server");
        document.getElementById("status").textContent = "Connected to server. Ready to record.";
        reconnectAttempts = 0;
      };

      wsAudio.onmessage = async (event) => {
        try {
          let data = JSON.parse(event.data);
          console.log(`Received result for chunk ${data.chunkId}: ${data.result}`);
          const resultsContainer = document.getElementById("results");
          if (resultsContainer.textContent.includes("No results yet")) {
            resultsContainer.textContent = "";
          }
          const para = document.createElement("p");
          para.textContent = `Chunk: ${data.chunkId} - Result: ${data.result}`;
          // Color coding based on result
          switch (data.result.toLowerCase()) {
            case "happy": para.style.color = "yellow"; break;
            case "sad": para.style.color = "darkblue"; break;  // Dark blue for sad
            case "angry": para.style.color = "red"; break;
            case "neutral": para.style.color = "gray"; break;
            case "calm": para.style.color = "blue"; break;  // Blue for calm
            case "fear": para.style.color = "black"; break;  // Black for fear
            case "disgust": para.style.color = "green"; break;  // Green for disgust
            case "surprise": para.style.color = "orange"; break;  // Orange for surprise
            default: para.style.color = "red";  // Default color if emotion is not recognized
        }
          resultsContainer.appendChild(para);
          resultsContainer.scrollTop = resultsContainer.scrollHeight;
        } catch (error) {
          console.error("Error parsing result:", error);
        }
      };

      wsAudio.onerror = (error) => console.error("WebSocket error:", error);

      wsAudio.onclose = () => {
        console.log("WebSocket closed.");
        if (reconnectAttempts < maxReconnects) {
          reconnectAttempts++;
          console.log(`Reconnecting in 3 seconds... (${reconnectAttempts}/${maxReconnects})`);
          setTimeout(connectWebSocket, 3000);
        } else {
          console.log("Max reconnection attempts reached.");
        }
      };
    }

    connectWebSocket();

    async function startRecording() {
      if (isRecording) return;
      isRecording = true;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        console.error("Error accessing microphone:", error);
        document.getElementById("status").textContent = "Microphone access denied.";
        document.getElementById("startBtn").disabled = true;
        return;
      }

      mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm; codecs=opus' });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && wsAudio.readyState === WebSocket.OPEN) {
          wsAudio.send(await event.data.arrayBuffer());
          console.log("Sent a complete audio chunk to the server.");
        }
      };

      // Start the cycle of recording segments
      function recordSegment() {
        if (!isRecording) return;
        mediaRecorder.start();
        setTimeout(() => {
          mediaRecorder.stop();
          // When the 'dataavailable' event fires, recordSegment will be called again.
          // We delay a bit before starting the next segment to ensure the recorder resets.
          setTimeout(recordSegment, 200);
        }, segmentDuration);
      }
      
      recordSegment();
      document.getElementById("status").textContent = "Recording... Streaming audio in 5-second segments.";
      document.getElementById("startBtn").disabled = true;
      document.getElementById("stopBtn").disabled = false;
    }

    document.getElementById("startBtn").addEventListener("click", startRecording);

    document.getElementById("stopBtn").addEventListener("click", () => {
      isRecording = false;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
      document.getElementById("status").textContent = "Recording stopped.";
      document.getElementById("startBtn").disabled = false;
      document.getElementById("stopBtn").disabled = true;
    });
  </script>
</body>
</html>
"""

# Allow cross-origin requests from all origins
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Load the static prediction components.
    predict.loaded_model = static.loaded_model
    predict.scaler2 = static.scaler2
    predict.encoder2 = static.encoder2  # Ensure proper dependency assignment

@app.get("/fastapi/")
def read_root():
    return {"Hello": "World"}

@app.get("/fastapi/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}

@app.post("/fastapi/upload_wav/")
async def upload_wav(file: UploadFile = File(...)):
    if not file.filename.endswith(".wav"):
        return {"error": "Only .wav files are allowed."}
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    res = await predict.prediction(file_path)
    return {"filename": file.filename, "path": file_path, "Emotion": res}

@app.get("/")
async def get():
    return HTMLResponse(html)

@app.get("/test")
async def serve_html_file():
    return FileResponse("tt.html", media_type="text/html")

async def convert_webm_bytes_to_wav(webm_bytes: bytes, wav_output_path: str):
    """
    Convert the provided WebM audio bytes to a WAV file using FFmpeg.
    """
    command = [
        "ffmpeg",
        "-y",                  # Overwrite output file if it exists
        "-hide_banner",
        "-loglevel", "error",
        "-f", "webm",          # Specify input format as WebM
        "-i", "pipe:0",        # Read input from stdin
        "-acodec", "pcm_s16le",
        "-ac", "1",            # Convert to mono audio (optional)
        "-ar", "48000",
        "-f", "wav",
        wav_output_path         # Output file path
    ]
    process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await process.communicate(webm_bytes)
    if process.returncode != 0:
        error_message = stderr.decode()
        print("FFmpeg conversion error:", error_message)
        raise RuntimeError(f"FFmpeg error: {error_message}")

@app.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to WebSocket for audio streaming.")

    try:
        while True:
            try:
                webm_bytes = await websocket.receive_bytes()
                if not webm_bytes:
                    print("Received empty audio chunk, skipping...")
                    continue

                # Generate a unique chunk ID based on the current event loop time.
                chunk_id = int(asyncio.get_running_loop().time() * 5000)
                wav_file_path = os.path.join(UPLOAD_DIR, f"chunk_{chunk_id}.wav")

                # Convert the complete WebM audio chunk to a WAV file.
                await convert_webm_bytes_to_wav(webm_bytes, wav_file_path)
                print(f"Converted audio chunk {chunk_id} to {wav_file_path}")

                result = await predict.prediction(wav_file_path)
                response = {
                    "chunkId": chunk_id,
                    "filePath": wav_file_path,
                    "result": result
                }

                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(response)
                    print(f"Sent prediction result for chunk {chunk_id}: {result}")
                else:
                    print("WebSocket closed before sending data.")
                    break

            except WebSocketDisconnect:
                print("Client disconnected from audio WebSocket.")
                break

            except Exception as e:
                print(f"Error processing audio chunk: {e}")
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"error": "Processing error occurred."})
                continue  
    except WebSocketDisconnect:
        print("Audio WebSocket connection lost.")
    finally:
        print("Audio WebSocket connection closed.")

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("your_module:app", host="0.0.0.0", port=8000, reload=True)

