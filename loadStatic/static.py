from tensorflow.keras.models import load_model
import pickle

loaded_model = None
scaler2 = None
encoder2 = None

loaded_model = load_model('./staticFiles/best_model1_weights.h5')
# print("Loaded model from .h5 file")
    
with open('./staticFiles/scaler2.pickle', 'rb') as f:
    scaler2 = pickle.load(f)
    
with open('./staticFiles/encoder2.pickle', 'rb') as f:
    encoder2 = pickle.load(f)