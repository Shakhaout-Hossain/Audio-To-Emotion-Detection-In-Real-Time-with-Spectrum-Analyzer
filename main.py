from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import shutil
import asyncio
from fastapi.websockets import WebSocketState
from loadStatic import predict, static

app = FastAPI()


# Serve static files (Ensure you have a 'static' folder)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/frontend", StaticFiles(directory="static"), name="frontend")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)  # Ensure the upload directory exists

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
    
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Serve the favicon.ico file."""
    favicon_path = "static/favicon.ico"
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/vnd.microsoft.icon")
    return {"error": "Favicon not found"}

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

# @app.get("/")
# async def get():
#     return HTMLResponse(html)

@app.get("/")
async def serve_html_file():
    return FileResponse("index.html", media_type="text/html")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("your_module:app", host="0.0.0.0", port=8000, reload=True)

