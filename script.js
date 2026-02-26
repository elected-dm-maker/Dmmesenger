// ============================================================
// 1. ИНИЦИАЛИЗАЦИЯ ПОДКЛЮЧЕНИЯ (SOCKET.IO ДЛЯ RENDER)
// ============================================================
const socket = io(); // Подключаемся к твоему серверу server.js

// ============================================================
// 2. ОБЪЯВЛЕНИЕ ВСЕХ ЭЛЕМЕНТОВ ИНТЕРФЕЙСА (НИЧЕГО НЕ ПРОПУЩЕНО)
// ============================================================
const authScreen = document.getElementById('auth-screen');
const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const mediaBtn = document.getElementById('mediaBtn');
const imageInput = document.getElementById('imageInput');
const chatWindow = document.getElementById('mainChatWindow');
const videoPreview = document.getElementById('video-record-preview');
const typingBox = document.getElementById('typing-box');
const settingsModal = document.getElementById('settings-modal');
const contextMenu = document.getElementById('context-menu');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callInterface = document.getElementById('call-interface');

// ПЕРЕМЕННЫЕ СОСТОЯНИЯ
let activeChat = "Алексей";
let mediaRecorder, callStream, audioChunks = [], videoChunks = [];
let pressTimer, currentMode = "audio", selectedMsgId = null;
let isScreenSharing = false;

// ЭЛЕМЕНТ ДЛЯ GHOST TYPING (Призрачный ввод)
const ghostSpan = document.createElement('span');
ghostSpan.className = 'ghost-text';
typingBox.appendChild(ghostSpan);

// ============================================================
// 3. ЛОГИКА АВТОРИЗАЦИИ (ВХОД ЧЕРЕЗ СЕРВЕР)
// ============================================================
document.getElementById('loginBtn').onclick = function() {
    const login = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    
    if (login !== "") {
        sessionStorage.setItem('currentUser', login);
        authScreen.style.display = 'none';
        initApp();
    } else {
        alert("Введите хотя бы логин!");
    }
};

// Регистрация на кастомном сервере обычно не нужна, но оставим кнопку для красоты
document.getElementById('regBtn').onclick = function() {
    alert("На этом сервере вход свободный! Просто введите логин и нажмите Войти.");
};

function initApp() {
    setupChatListeners();
    applySavedSettings();
    console.log("Мессенджер успешно запущен через Socket.io");
}

// ============================================================
// 4. ЛОГИКА ЧАТА (ОТПРАВКА И ПОЛУЧЕНИЕ СООБЩЕНИЙ)
// ============================================================
function handleNewMessage(content, isHTML = false) {
    const myName = sessionStorage.getItem('currentUser');
    if (!myName) return;

    const msgData = {
        author: myName,
        content: content,
        isHTML: isHTML,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        id: Date.now()
    };

    // ОТПРАВЛЯЕМ НА СЕРВЕР
    socket.emit('chat message', msgData);
    
    // Сбрасываем статус печати
    updateGhostTyping("");
}

// СЛУШАЕМ СЕРВЕР (Когда кто-то прислал сообщение)
socket.on('chat message', function(msg) {
    const myName = sessionStorage.getItem('currentUser');
    const type = (msg.author === myName) ? 'sent' : 'received';
    appendToDOM(msg.author, msg.content, type, msg.isHTML, msg.time, msg.id);
});

function appendToDOM(author, content, type, isHTML, time, id) {
    const msgDiv = document.createElement('div');
    msgDiv.className = "message " + type;
    msgDiv.dataset.id = id;
    
    const textWrapper = isHTML ? content : "<span>" + content + "</span>";
    msgDiv.innerHTML = `
        <strong>${author}</strong>
        <div class="msg-text-content">${textWrapper}</div>
        <small class="msg-time">${time}</small>
    `;

    // Контекстное меню (Правка/Удаление локально для этого сеанса)
    msgDiv.oncontextmenu = function(e) {
        if (type === 'received') return;
        e.preventDefault();
        selectedMsgId = id;
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
    };

    chatBox.insertBefore(msgDiv, typingBox);
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 5. GHOST TYPING (ЖИВОЙ ВВОД ЧЕРЕЗ СЕРВЕР)
// ============================================================
messageInput.addEventListener('input', function(e) {
    const myName = sessionStorage.getItem('currentUser');
    socket.emit('typing', { text: e.target.value, user: myName });
});

socket.on('typing', function(data) {
    if (data.text.length > 0) {
        typingBox.style.display = 'flex';
        ghostSpan.textContent = data.user + ": " + data.text;
    } else {
        typingBox.style.display = 'none';
    }
});

function updateGhostTyping(text) {
    const myName = sessionStorage.getItem('currentUser');
    socket.emit('typing', { text: text, user: myName });
}

// ============================================================
// 6. МЕДИА (ГОЛОСОВЫЕ И ВИДЕО-КРУЖОЧКИ)
// ============================================================
mediaBtn.onmousedown = function() {
    pressTimer = setTimeout(function() {
        currentMode = (currentMode === "audio") ? "video" : "audio";
        mediaBtn.innerHTML = (currentMode === "audio") ? "🎤" : "🔘";
        pressTimer = null;
    }, 600);
};

mediaBtn.onclick = function() {
    if (pressTimer) {
        clearTimeout(pressTimer);
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            startRecording();
        } else {
            stopRecording();
        }
    }
};

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: (currentMode === "video") 
        });
        
        mediaBtn.classList.add('recording-active');

        if (currentMode === "video") {
            videoPreview.style.display = 'block';
            videoPreview.srcObject = stream;
        }

        mediaRecorder = new MediaRecorder(stream);
        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        
        mediaRecorder.onstop = function() {
            const blob = new Blob(chunks, { type: (currentMode === "video") ? 'video/webm' : 'audio/webm' });
            const reader = new FileReader();
            reader.onload = function() {
                const tag = (currentMode === "video") 
                    ? `<video src="${reader.result}" autoplay loop muted class="video-note" onclick="this.muted = !this.muted"></video>`
                    : `<audio src="${reader.result}" controls></audio>`;
                handleNewMessage(tag, true);
            };
            reader.readAsDataURL(blob);
            
            stream.getTracks().forEach(t => t.stop());
            videoPreview.style.display = 'none';
            mediaBtn.classList.remove('recording-active');
        };

        mediaRecorder.start();
    } catch (err) {
        alert("Нет доступа к камере или микрофону!");
    }
}

function stopRecording() {
    if (mediaRecorder) mediaRecorder.stop();
}

// ============================================================
// 7. ЗВОНКИ И ДЕМОНСТРАЦИЯ ЭКРАНА
// ============================================================
document.getElementById('videoCallBtn').onclick = async function() {
    callInterface.style.display = 'flex';
    try {
        callStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = callStream;
    } catch (e) {
        alert("Не удалось включить камеру.");
    }
};

document.getElementById('endCallBtn').onclick = function() {
    if (callStream) callStream.getTracks().forEach(t => t.stop());
    callInterface.style.display = 'none';
    localVideo.srcObject = null;
};

document.getElementById('toggleMic').onclick = function() {
    const track = callStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    this.style.background = track.enabled ? "" : "#ff4b2b";
};

document.getElementById('toggleCam').onclick = function() {
    const track = callStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    this.style.background = track.enabled ? "" : "#ff4b2b";
};

document.getElementById('shareScreenBtn').onclick = async function() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localVideo.srcObject = screenStream;
        screenStream.getVideoTracks()[0].onended = () => {
            localVideo.srcObject = callStream;
        };
    } catch (e) {
        console.log("Screen share cancelled");
    }
};

// ============================================================
// 8. НАСТРОЙКИ (ТЕМЫ, ФОНЫ, ШРИФТЫ)
// ============================================================
document.getElementById('settingsBtn').onclick = () => settingsModal.classList.add('active');
document.getElementById('closeSettingsBtn').onclick = () => settingsModal.classList.remove('active');

document.getElementById('setLightTheme').onclick = function() {
    document.body.className = 'light-theme';
    localStorage.setItem('theme', 'light-theme');
};

document.getElementById('setDarkTheme').onclick = function() {
    document.body.className = 'dark-theme';
    localStorage.setItem('theme', 'dark-theme');
};

document.getElementById('fontSelect').onchange = function(e) {
    document.documentElement.style.setProperty('--main-font', e.target.value);
    localStorage.setItem('font', e.target.value);
};

document.getElementById('bgImageInput').onchange = function() {
    if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const url = "url(" + e.target.result + ")";
            chatWindow.style.backgroundImage = url;
            localStorage.setItem('custom_bg', url);
        };
        reader.readAsDataURL(this.files[0]);
    }
};

document.getElementById('resetBgBtn').onclick = function() {
    chatWindow.style.backgroundImage = '';
    localStorage.removeItem('custom_bg');
};

// ============================================================
// 9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
sendBtn.onclick = function() {
    const val = messageInput.value.trim();
    if (val !== "") {
        handleNewMessage(val, false);
        messageInput.value = "";
    }
};

messageInput.onkeypress = function(e) { if (e.key === 'Enter') sendBtn.click(); };

imageInput.onchange = function() {
    if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgHtml = `<img src="${e.target.result}" style="max-width:250px; border-radius:15px; cursor:pointer;" onclick="window.open(this.src)">`;
            handleNewMessage(imgHtml, true);
        };
        reader.readAsDataURL(this.files[0]);
    }
};

function setupChatListeners() {
    document.querySelectorAll('.chat-item').forEach(function(item) {
        item.onclick = function() {
            document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            activeChat = this.dataset.user;
            document.getElementById('current-chat-name').textContent = activeChat;
            chatBox.innerHTML = ""; // Очищаем локально при смене чата
            chatBox.appendChild(typingBox); // Возвращаем индикатор
        };
    });
}

function applySavedSettings() {
    const theme = localStorage.getItem('theme') || 'dark-theme';
    const font = localStorage.getItem('font') || "'Inter', sans-serif";
    const bg = localStorage.getItem('custom_bg');
    document.body.className = theme;
    document.documentElement.style.setProperty('--main-font', font);
    if (bg) chatWindow.style.backgroundImage = bg;
}

// Удаление/Правка (локально для текущей сессии)
document.getElementById('ctx-delete').onclick = function() {
    const el = document.querySelector(`[data-id="${selectedMsgId}"]`);
    if (el) el.remove();
    contextMenu.style.display = 'none';
};

document.getElementById('ctx-edit').onclick = function() {
    const msgNode = document.querySelector(`[data-id="${selectedMsgId}"] .msg-text-content`);
    const newVal = prompt("Редактировать:", msgNode.innerText);
    if (newVal) msgNode.innerHTML = `<span>${newVal} (изм.)</span>`;
    contextMenu.style.display = 'none';
};

window.onclick = () => contextMenu.style.display = 'none';
