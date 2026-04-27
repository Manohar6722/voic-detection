import os
import json
import sqlite3
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import librosa

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
        tmp_path = "temp_audio.wav"
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        y, sr = librosa.load(tmp_path, sr=None)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return mfcc
    except Exception as e:
        print(f"Error extracting features: {e}")
        return None

def dtw_distance(seq1, seq2):
    """Pure-Python/NumPy DTW — no external library needed."""
    s1 = seq1.T  # (frames, 20)
    s2 = seq2.T
    n, m = len(s1), len(s2)
    dtw = np.full((n + 1, m + 1), np.inf)
    dtw[0, 0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = np.linalg.norm(s1[i - 1] - s2[j - 1])
            dtw[i, j] = cost + min(dtw[i - 1, j],
                                   dtw[i, j - 1],
                                   dtw[i - 1, j - 1])
    return dtw[n, m] / (n + m)

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
        conn.close()
        return jsonify({'error': 'Could not process audio. Please speak clearly.'}), 500

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

    stored_mfcc = np.array(json.loads(row[0]))
    audio_bytes = audio_file.read()
    attempt_mfcc = extract_mfcc(audio_bytes)

    if attempt_mfcc is None:
        return jsonify({'error': 'Could not process audio.'}), 500

    distance = dtw_distance(stored_mfcc, attempt_mfcc)
    print(f"Login attempt for {user_id}. DTW Distance: {distance:.4f}")

    THRESHOLD = 65.0
    if distance < THRESHOLD:
        return jsonify({'success': True, 'message': 'Voice matched!', 'distance': distance})
    else:
        return jsonify({'error': 'Voice profile does not match.', 'distance': distance}), 401

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Secure Folder Server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
