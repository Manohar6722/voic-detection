// View Elements
const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const dashboardView = document.getElementById('dashboard-view');

// Links
const linkToRegister = document.getElementById('link-to-register');
const linkToLogin = document.getElementById('link-to-login');
const logoutBtn = document.getElementById('logout-btn');

// Login Elements
const loginIdInput = document.getElementById('login-id');
const loginVoiceBtn = document.getElementById('login-voice-btn');
const loginRecordingIndicator = document.getElementById('login-recording-indicator');
const loginStatus = document.getElementById('login-status');

// Register Elements
const regIdInput = document.getElementById('reg-id');
const regPinInput = document.getElementById('reg-pin');
const regVoiceBtn = document.getElementById('reg-voice-btn');
const regRecordingIndicator = document.getElementById('reg-recording-indicator');
const submitRegisterBtn = document.getElementById('submit-register-btn');
const regStatus = document.getElementById('reg-status');

// Dashboard Elements
const currentUserSpan = document.getElementById('current-user');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const galleryGrid = document.getElementById('gallery-grid');

// Modal Elements
const fileModal = document.getElementById('file-modal');
const modalContent = document.getElementById('modal-content');
const modalCaption = document.getElementById('modal-caption');
const closeModalBtn = document.getElementById('close-modal-btn');


// --- PERSISTENT FILE STORAGE LOGIC (Frontend) --- //
// User logic is now in the Python Backend database
const DB_KEY_FILES = 'secure_folder_files';
let recordedFiles = JSON.parse(localStorage.getItem(DB_KEY_FILES)) || [];
let loggedInUser = null;
let tempRegistrationAudioBlob = null; 

function saveFiles() {
    try {
        localStorage.setItem(DB_KEY_FILES, JSON.stringify(recordedFiles));
    } catch (e) {
        console.error("Storage Error:", e);
        alert("Browser Storage Full! You have reached the ~5MB limit for permanent browser storage.");
        recordedFiles.pop(); 
    }
}


// --- NAVIGATION LOGIC --- //
function switchView(viewToShow) {
    [loginView, registerView, dashboardView].forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden');
    });
    viewToShow.classList.remove('hidden');
    setTimeout(() => {
        viewToShow.classList.add('active');
    }, 50);
}

linkToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(registerView);
    regStatus.textContent = '';
});

linkToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(loginView);
    loginStatus.textContent = '';
});

logoutBtn.addEventListener('click', () => {
    loggedInUser = null;
    switchView(loginView);
    loginIdInput.value = '';
    loginStatus.textContent = 'Logged out successfully.';
    loginStatus.className = 'status-msg success';
});


// --- MODAL LOGIC --- //
closeModalBtn.addEventListener('click', () => {
    fileModal.classList.add('hidden');
});
fileModal.addEventListener('click', (e) => {
    if (e.target === fileModal) {
        fileModal.classList.add('hidden');
    }
});

function openModal(file) {
    modalContent.innerHTML = '';
    if (file.isImage) {
        const img = document.createElement('img');
        img.src = file.preview;
        modalContent.appendChild(img);
    } else {
        const docDiv = document.createElement('div');
        docDiv.className = 'doc-placeholder';
        docDiv.textContent = '📄';
        modalContent.appendChild(docDiv);
    }
    modalCaption.textContent = file.name;
    fileModal.classList.remove('hidden');
}


// --- ACTUAL VOICE RECORDING (WAV) LOGIC --- //
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function captureAudioBlob(indicator, statusEl, successMsg) {
    return new Promise(async (resolve) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            indicator.classList.remove('hidden');
            statusEl.textContent = 'Recording... Please speak clearly.';
            statusEl.className = 'status-msg';

            let audioChunks = [];
            
            processor.onaudioprocess = function(e) {
                const channelData = e.inputBuffer.getChannelData(0);
                audioChunks.push(new Float32Array(channelData));
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            // Record for 3.5 seconds
            setTimeout(() => {
                source.disconnect();
                processor.disconnect();
                stream.getTracks().forEach(track => track.stop());
                
                indicator.classList.add('hidden');
                statusEl.textContent = successMsg;
                statusEl.className = 'status-msg success';

                // Combine chunks
                const length = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const result = new Float32Array(length);
                let offset = 0;
                for (let i = 0; i < audioChunks.length; i++) {
                    result.set(audioChunks[i], offset);
                    offset += audioChunks[i].length;
                }

                // Create WAV blob
                const wavBlob = encodeWAV(result, audioContext.sampleRate);
                audioContext.close();
                resolve(wavBlob);

            }, 3500);

        } catch (error) {
            indicator.classList.add('hidden');
            statusEl.textContent = 'Microphone access denied or unavailable.';
            statusEl.className = 'status-msg error';
            resolve(null);
        }
    });
}


// --- REGISTRATION LOGIC --- //
regVoiceBtn.addEventListener('click', async () => {
    if (!regIdInput.value || !regPinInput.value) {
        regStatus.textContent = 'Please enter ID and PIN first.';
        regStatus.className = 'status-msg error';
        return;
    }
    
    regVoiceBtn.classList.add('hidden');
    tempRegistrationAudioBlob = await captureAudioBlob(regRecordingIndicator, regStatus, 'Voice recorded!');
    regVoiceBtn.classList.remove('hidden');
    
    if (tempRegistrationAudioBlob) {
        submitRegisterBtn.disabled = false;
    }
});

submitRegisterBtn.addEventListener('click', async () => {
    const userId = regIdInput.value;
    const pin = regPinInput.value;
    
    if (!userId || !pin || !tempRegistrationAudioBlob) {
        regStatus.textContent = 'Complete all fields and record voice.';
        return;
    }

    submitRegisterBtn.disabled = true;
    regStatus.textContent = 'Saving securely to database...';
    regStatus.className = 'status-msg';

    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('pin', pin);
    formData.append('audio', tempRegistrationAudioBlob, 'voice.wav');

    try {
        const response = await fetch('http://localhost:5000/api/register', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            regStatus.textContent = 'Registration complete! You can now log in.';
            regStatus.className = 'status-msg success';
            
            // Reset form
            regIdInput.value = '';
            regPinInput.value = '';
            tempRegistrationAudioBlob = null;
            
            setTimeout(() => {
                switchView(loginView);
                loginIdInput.value = userId;
            }, 2000);
        } else {
            regStatus.textContent = data.error || 'Registration failed.';
            regStatus.className = 'status-msg error';
            submitRegisterBtn.disabled = false;
        }
    } catch (error) {
        regStatus.textContent = 'Could not connect to Python Server. Is it running?';
        regStatus.className = 'status-msg error';
        submitRegisterBtn.disabled = false;
    }
});


// --- LOGIN LOGIC --- //
loginVoiceBtn.addEventListener('click', async () => {
    const userId = loginIdInput.value;
    
    if (!userId) {
        loginStatus.textContent = 'Please enter your User ID.';
        loginStatus.className = 'status-msg error';
        return;
    }

    loginVoiceBtn.classList.add('hidden');
    const attemptAudioBlob = await captureAudioBlob(loginRecordingIndicator, loginStatus, 'Checking biometric database...');
    
    if (attemptAudioBlob) {
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('audio', attemptAudioBlob, 'voice.wav');

        try {
            const response = await fetch('http://localhost:5000/api/login', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                loginStatus.textContent = 'Voice match confirmed! Access Granted.';
                loginStatus.className = 'status-msg success';
                setTimeout(() => {
                    loggedInUser = userId;
                    currentUserSpan.textContent = userId;
                    renderGallery();
                    switchView(dashboardView);
                }, 1000);
            } else {
                loginStatus.textContent = data.error || 'Access Denied.';
                loginStatus.className = 'status-msg error';
            }
        } catch (error) {
            loginStatus.textContent = 'Could not connect to Python Server.';
            loginStatus.className = 'status-msg error';
        }
    }
    loginVoiceBtn.classList.remove('hidden');
});


// --- DASHBOARD: FILE UPLOAD & GALLERY LOGIC --- //
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--primary-glow)';
    uploadZone.style.background = 'rgba(59, 130, 246, 0.1)';
});

uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    uploadZone.style.background = '';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    uploadZone.style.background = '';
    
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
});

function handleFiles(files) {
    Array.from(files).forEach(file => {
        let isImage = file.type.startsWith('image/');
        
        if (isImage) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64String = e.target.result;
                
                const fileData = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    date: new Date().toLocaleDateString(),
                    preview: base64String, 
                    isImage: isImage,
                    owner: loggedInUser
                };

                recordedFiles.push(fileData);
                saveFiles(); 
                renderGallery(); 
            };
            reader.readAsDataURL(file); 
        } else {
            const fileData = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                name: file.name,
                date: new Date().toLocaleDateString(),
                preview: '📄',
                isImage: isImage,
                owner: loggedInUser
            };
            recordedFiles.push(fileData);
            saveFiles(); 
            renderGallery(); 
        }
    });
}

function renderGallery() {
    galleryGrid.innerHTML = '';
    
    const userFiles = recordedFiles.filter(f => f.owner === loggedInUser);
    
    if (userFiles.length === 0) {
        galleryGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No files secured yet. Upload a file above.</p>';
        return;
    }

    userFiles.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.style.cursor = 'pointer'; 
        
        const previewContent = file.isImage 
            ? `<img src="${file.preview}" alt="${file.name}">` 
            : file.preview;

        card.innerHTML = `
            <div class="file-preview">${previewContent}</div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-date">${file.date}</div>
            </div>
        `;
        
        card.addEventListener('click', () => openModal(file));
        
        galleryGrid.appendChild(card);
    });
}
