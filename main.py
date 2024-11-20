from fastapi import FastAPI, File, UploadFile
import os
import h5py
import librosa
import tensorflow as tf
import shutil
import numpy as np
from loadStatic import predict, static
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Load model and static files


# Define the directory to save uploaded files
UPLOAD_DIR = "uploads"

# Ensure the upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)



@app.on_event("startup")
async def startup_event():
    # global loaded_model, scaler2, encoder2
    predict.loaded_model = static.loaded_model
    predict.scaler2 = static.scaler2
    predict.encoder2 = static.scaler2
    


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str| None = None):
    return {"item_id": item_id, "q": q}



@app.post("/upload_wav/")
async def upload_wav(file: UploadFile = File(...)):
    if not file.filename.endswith(".wav"):
        return {"error": "Only .wav files are allowed."}

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    res = await predict.prediction(file_path)
    return {"filename": file.filename, "path": file_path, "Emotion": res}
    # return {"emotion":res}