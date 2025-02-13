from fastapi import FastAPI, File, UploadFile
import os
import h5py
import librosa
import tensorflow as tf
import shutil
import numpy as np
import pickle

from tensorflow.keras.models import load_model

# app = FastAPI()

# Define the directory to save uploaded files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Load model and scalers
loaded_model = None
scaler2 = None
encoder2 = None


# Feature extraction functions...
# (Include your ZCR, RMSE, MFCC, and extract_features functions here)

# Zero Crossing Rate (ZCR)
def zcr(data, frame_length, hop_length):
    zcr = librosa.feature.zero_crossing_rate(y=data, frame_length=frame_length, hop_length=hop_length)
    return np.squeeze(zcr)  # Remove unnecessary dimensions if present

# Root Mean Square Error (RMSE)
def rmse(data, frame_length=2048, hop_length=512):
    rmse = librosa.feature.rms(y=data, frame_length=frame_length, hop_length=hop_length)
    return np.squeeze(rmse)  # Remove unnecessary dimensions

# Mel-frequency Cepstral Coefficients (MFCC)
def mfcc(data, sr, frame_length=2048, hop_length=512, flatten=True):
    mfcc_features = librosa.feature.mfcc(y=data, sr=sr, n_fft=frame_length, hop_length=hop_length)
    return np.ravel(mfcc_features.T) if flatten else np.squeeze(mfcc_features.T)

# Extract Features: combines ZCR, RMSE, and MFCC
def extract_features(data, sr=22050, frame_length=2048, hop_length=512):
    result = np.hstack((
        zcr(data, frame_length, hop_length),
        rmse(data, frame_length, hop_length),
        mfcc(data, sr, frame_length, hop_length)
    ))
    return result

async def get_predict_feat(path):
    d, s_rate = librosa.load(path, duration=2.5, offset=0.6)
    res = extract_features(d)

    # Ensure result is of fixed length 2376 by padding or truncating
    target_length = 2376
    if res.size < target_length:
        # Pad with zeros if the result is too short
        res = np.pad(res, (0, target_length - res.size), mode='constant')
    else:
        # Truncate if the result is too long
        res = res[:target_length]

    result = np.array(res)
    result = np.reshape(result, newshape=(1, target_length))
    i_result = scaler2.transform(result)  # Assuming scaler2 is pre-fitted for this shape
    final_result = np.expand_dims(i_result, axis=2)

    return final_result
emotions1={1:'Neutral', 2:'Calm', 3:'Happy', 4:'Sad', 5:'Angry', 6:'Fear', 7:'Disgust',8:'Surprise'}

async def prediction(path1):
    res = await get_predict_feat(path1)
    predictions = loaded_model.predict(res)  # Assuming predictions are probabilities for each class
    # print(type( predictions))
    pre = {}
    p = int(1)
    for i in range(8):
        # pre[emotions1[p]]= i*100
        # p=p+1
        # print(emotions1[p])
        
        # print(predictions[0][i]*100)
        pre[emotions1[p]]=round(predictions[0][i]*100,3)
        p=p+1

    # Convert probabilities to class index
    predicted_index = np.argmax(predictions, axis=1)

    # Map predicted index to the corresponding emotion label
    y_pred = [emotions1[i+1] for i in predicted_index]  # Adjust index by 1 due to emotions1 dictionary keys
    # print(predicted_index)
    # print(y_pred[0])  # Print the first prediction result
    # return y_pred[0]
    return y_pred[0]
