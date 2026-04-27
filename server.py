import os
import json
import sqlite3
import io
import wave
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import librosa
import soundfile as sf
import numpy as np
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DB_FILE = 'secure_folder.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            pin TEXT NOT NULL,
            mfcc_features TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def extract_mfcc(audio_bytes):
    try:
        # Save to temporary file since librosa handles standard formats well
        with open("temp_audio.wav", "wb") as f:
            f.write(audio_bytes)
        
        # Load audio (librosa uses audioread which handles webm/ogg via ffmpeg, 
        # or we might need to rely on the browser sending a compatible format)
        y, sr = librosa.load("temp_audio.wav", sr=None)
        
        # Extract MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        
        # Clean up
        if os.path.exists("temp_audio.wav"):
            os.remove("temp_audio.wav")
            
        return mfcc
    except Exception as e:
        print(f"Error extracting features: {e}")
        return None

def compare_features(mfcc1, mfcc2):
    # Using dynamic time warping to compare MFCCs of different lengths
    distance, path = fastdtw(mfcc1.T, mfcc2.T, dist=euclidean)
    # Normalize distance by path length
    return distance / len(path)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/register', methods=['POST'])
def register():
    user_id = request.form.get('userId')
    pin = request.form.get('pin')
    audio_file = request.files.get('audio')
    
    if not user_id or not pin or not audio_file:
        return jsonify({'error': 'Missing required fields'}), 400
        
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT user_id FROM users WHERE user_id = ?', (user_id,))
    if c.fetchone():
        conn.close()
        return jsonify({'error': 'User ID already exists'}), 400
        
    audio_bytes = audio_file.read()
    mfcc = extract_mfcc(audio_bytes)
    
    if mfcc is None:
        return jsonify({'error': 'Could not process audio. Please ensure you are speaking clearly.'}), 500
        
    # Serialize mfcc array as JSON string
    mfcc_json = json.dumps(mfcc.tolist())
    
    c.execute('INSERT INTO users (user_id, pin, mfcc_features) VALUES (?, ?, ?)',
              (user_id, pin, mfcc_json))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Registered successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    user_id = request.form.get('userId')
    audio_file = request.files.get('audio')
    
    if not user_id or not audio_file:
        return jsonify({'error': 'Missing required fields'}), 400
        
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT mfcc_features FROM users WHERE user_id = ?', (user_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'User not found'}), 404
        
    stored_mfcc_json = row[0]
    stored_mfcc = np.array(json.loads(stored_mfcc_json))
    
    audio_bytes = audio_file.read()
    attempt_mfcc = extract_mfcc(audio_bytes)
    
    if attempt_mfcc is None:
        return jsonify({'error': 'Could not process audio.'}), 500
        
    distance = compare_features(stored_mfcc, attempt_mfcc)
    print(f"Login attempt for {user_id}. DTW Distance: {distance}")
    
    # Set a threshold for voice matching. 
    # This might need tuning based on mic quality. 
    # Usually, a DTW distance below 50-70 indicates a good match for MFCCs.
    THRESHOLD = 65.0 
    
    if distance < THRESHOLD:
        return jsonify({'success': True, 'message': 'Voice matched!', 'distance': distance})
    else:
        return jsonify({'error': 'Voice profile does not match.', 'distance': distance}), 401

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Secure Folder Server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
