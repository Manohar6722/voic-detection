# 🛡️ Voice Detection Secure Folder

A full-stack web application that uses **voice biometrics** for authentication. Users register with a voice sample and log in by speaking — the system uses MFCC feature extraction and Dynamic Time Warping (DTW) to verify identity.

## 📁 Project Structure

```
voice-secure-folder/
├── server.py           # Flask backend — voice processing & auth API
├── index.html          # Frontend — Login, Register, Dashboard views
├── styles.css          # Dark glassmorphism UI styles
├── app.js              # Frontend logic — recording, API calls, gallery
├── requirements.txt    # Python dependencies
└── README.md
```

## ⚙️ How It Works

1. **Registration** — User enters an ID + PIN, records a 3.5s voice sample. The server extracts 20 MFCC coefficients via `librosa` and stores them in SQLite.
2. **Login** — User speaks again. The server compares new MFCCs against stored ones using FastDTW. If the normalized DTW distance is below **65.0**, access is granted.
3. **Dashboard** — Authenticated users can upload images/documents stored locally in the browser.

---

## 🚀 Deploy on Render

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Voice Detection Secure Folder"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/voice-secure-folder.git
git push -u origin main
```

### Step 2 — Create a Web Service on Render

1. Go to [https://render.com](https://render.com) and sign in.
2. Click **New → Web Service**.
3. Connect your GitHub repo.
4. Fill in the settings:

| Field | Value |
|---|---|
| **Environment** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python server.py` |
| **Instance Type** | Free |

5. Click **Create Web Service** and wait for the build to complete.

### Step 3 — Update the Frontend API URL

Once deployed, Render gives you a URL like `https://voice-secure-folder.onrender.com`.

Open `app.js` and replace **both** occurrences of `http://localhost:5000` with your Render URL:

```js
// Change this:
const response = await fetch('http://localhost:5000/api/register', { ... });

// To this:
const response = await fetch('https://your-app-name.onrender.com/api/register', { ... });
```

Then commit and push again:
```bash
git add app.js
git commit -m "Update API URL for Render deployment"
git push
```

---

## 💻 Run Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Start the server
python server.py
```

Then open your browser at: **http://localhost:5000**

---

## 🔬 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JS, Web Audio API |
| Backend | Python, Flask, Flask-CORS |
| Voice Processing | Librosa (MFCC), FastDTW, NumPy, SciPy |
| Database | SQLite (via Python `sqlite3`) |

---

## ⚠️ Notes

- Voice matching threshold is set to **65.0** (DTW distance). You can tune this in `server.py` if needed.
- The database (`secure_folder.db`) is created automatically on first run.
- File uploads are stored in **browser localStorage** — they are not sent to the server.
- On Render's free tier, the service sleeps after inactivity and may take ~30s to wake up.
