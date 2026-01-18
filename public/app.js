// ============================================
// PWA - INSTALAÇÃO DO APP
// ============================================

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registrado'))
            .catch(err => console.log('❌ SW erro:', err));
    });
}

// Capturar evento de instalação
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Mostrar popup automaticamente
    showInstallPopup();
});

// Mostrar popup de instalação
function showInstallPopup() {
    // Verificar se já instalou ou se já mostrou recentemente
    if (localStorage.getItem('pwaInstalled') || localStorage.getItem('pwaPromptDismissed')) {
        return;
    }

    // Criar popup
    const popup = document.createElement('div');
    popup.id = 'install-popup';
    popup.innerHTML = `
        <div class="install-popup-content">
            <div class="install-icon">📱</div>
            <div class="install-text">
                <h3>Instalar ConsórcioChat</h3>
                <p>Adicione à sua tela inicial para acesso rápido!</p>
            </div>
            <div class="install-buttons">
                <button id="install-btn" class="btn-install">Instalar</button>
                <button id="dismiss-btn" class="btn-dismiss">Agora não</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    // Botão instalar
    document.getElementById('install-btn').addEventListener('click', async () => {
        popup.remove();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                localStorage.setItem('pwaInstalled', 'true');
            }
            deferredPrompt = null;
        }
    });

    // Botão dispensar
    document.getElementById('dismiss-btn').addEventListener('click', () => {
        popup.remove();
        // Não mostrar novamente por 24 horas
        localStorage.setItem('pwaPromptDismissed', Date.now().toString());
        setTimeout(() => localStorage.removeItem('pwaPromptDismissed'), 24 * 60 * 60 * 1000);
    });
}

// Mostrar popup para iOS (que não suporta beforeinstallprompt)
function showIOSInstallPopup() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isInStandaloneMode && !localStorage.getItem('iosPromptDismissed')) {
        const popup = document.createElement('div');
        popup.id = 'install-popup';
        popup.innerHTML = `
            <div class="install-popup-content">
                <div class="install-icon">📱</div>
                <div class="install-text">
                    <h3>Instalar ConsórcioChat</h3>
                    <p>Toque em <strong>Compartilhar</strong> ⬆️ e depois <strong>"Adicionar à Tela de Início"</strong></p>
                </div>
                <div class="install-buttons">
                    <button id="ios-dismiss-btn" class="btn-dismiss">Entendi</button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);

        document.getElementById('ios-dismiss-btn').addEventListener('click', () => {
            popup.remove();
            localStorage.setItem('iosPromptDismissed', 'true');
        });
    }
}

// Mostrar popup iOS quando página carregar
window.addEventListener('load', () => {
    setTimeout(showIOSInstallPopup, 2000);
});

// ============================================
// ESTADO DA APLICAÇÃO
// ============================================

// Estado da aplicação
const state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    socket: null,
    currentContact: null,
    conversations: [],
    messages: {},
    typingTimeout: null,
    pendingAttachment: null
};

// Elementos DOM
const elements = {
    // Auth screen
    authScreen: document.getElementById('auth-screen'),
    phoneInput: document.getElementById('phone-input'),
    codeInput: document.getElementById('code-input'),
    authLoading: document.getElementById('auth-loading'),
    phoneField: document.getElementById('phone'),
    codeField: document.getElementById('code'),
    sendCodeBtn: document.getElementById('send-code-btn'),
    verifyBtn: document.getElementById('verify-btn'),
    backBtn: document.getElementById('back-btn'),

    // Chat screen
    chatScreen: document.getElementById('chat-screen'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userPhone: document.getElementById('user-phone'),
    conversationsList: document.getElementById('conversations-list'),
    searchInput: document.getElementById('search-input'),
    newChatBtn: document.getElementById('new-chat-btn'),

    // Chat area
    emptyState: document.getElementById('empty-state'),
    activeChat: document.getElementById('active-chat'),
    contactAvatar: document.getElementById('contact-avatar'),
    contactName: document.getElementById('contact-name'),
    contactStatus: document.getElementById('contact-status'),
    messagesContainer: document.getElementById('messages-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    closeChatBtn: document.getElementById('close-chat-btn'),
    typingIndicator: document.getElementById('typing-indicator'),

    // Modal
    newChatModal: document.getElementById('new-chat-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    searchUsers: document.getElementById('search-users'),

    // File upload
    fileInput: document.getElementById('file-input'),
    attachBtn: document.getElementById('attach-btn'),
    attachmentPreview: document.getElementById('attachment-preview'),
    attachmentName: document.getElementById('attachment-name'),
    removeAttachment: document.getElementById('remove-attachment'),

    // Voice recording
    micBtn: document.getElementById('mic-btn'),
    recordingIndicator: document.getElementById('recording-indicator'),
    recordingTime: document.getElementById('recording-time'),
    stopRecording: document.getElementById('stop-recording'),

    // Avatar
    avatarInput: document.getElementById('avatar-input')
};

// ============================================
// AUTENTICAÇÃO
// ============================================

// Enviar código de verificação
elements.sendCodeBtn.addEventListener('click', async () => {
    const phone = elements.phoneField.value.trim();

    if (!phone) {
        alert('Por favor, insira seu número de telefone');
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/auth/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        const data = await response.json();

        if (data.success || response.ok) {
            hideLoading();
            elements.phoneInput.classList.remove('active');
            elements.codeInput.classList.add('active');

            // Mostrar o código na tela (modo gratuito)
            if (data.code) {
                showVerificationCodeModal(data.code, phone);
            } else {
                alert('Código enviado por SMS para seu celular!');
            }
        } else {
            hideLoading();
            alert(data.error || 'Erro ao enviar código');
        }
    } catch (error) {
        hideLoading();
        alert('Erro de conexão. Verifique se o servidor está rodando.');
        console.error('Erro:', error);
    }
});

// Modal para mostrar o código de verificação
function showVerificationCodeModal(code, phone) {
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
        <div class="verification-modal-content">
            <div class="verification-icon">📱</div>
            <h3>Código de Verificação</h3>
            <p>Seu código para o número <strong>${phone}</strong>:</p>
            <div class="verification-code">${code}</div>
            <p class="verification-note">Digite este código no campo abaixo para continuar</p>
            <button class="verification-close-btn" onclick="this.parentElement.parentElement.remove()">Entendi</button>
        </div>
    `;
    document.body.appendChild(modal);

    // Auto-preencher o código
    elements.codeField.value = code;
}

// Verificar código
elements.verifyBtn.addEventListener('click', async () => {
    const phone = elements.phoneField.value.trim();
    const code = elements.codeField.value.trim();

    if (!code || code.length !== 6) {
        alert('Por favor, insira o código de 6 dígitos');
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code })
        });

        const data = await response.json();

        if (data.success && data.token) {
            state.token = data.token;
            state.user = data.user;

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            hideLoading();
            showChatScreen();
        } else {
            hideLoading();
            alert(data.message || 'Código inválido ou expirado');
        }
    } catch (error) {
        hideLoading();
        alert('Erro de conexão');
        console.error('Erro:', error);
    }
});

// Voltar para tela de telefone
elements.backBtn.addEventListener('click', () => {
    elements.codeInput.classList.remove('active');
    elements.phoneInput.classList.add('active');
    elements.codeField.value = '';
});

// Formatação de telefone
elements.phoneField.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 6) {
        value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
        value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    }

    e.target.value = value;
});

// Apenas números no código
elements.codeField.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
});

function showLoading() {
    elements.phoneInput.classList.remove('active');
    elements.codeInput.classList.remove('active');
    elements.authLoading.classList.add('active');
}

function hideLoading() {
    elements.authLoading.classList.remove('active');
}

// ============================================
// CHAT
// ============================================

function showChatScreen() {
    elements.authScreen.classList.remove('active');
    elements.chatScreen.classList.add('active');

    // Exibir informações do usuário
    elements.userName.textContent = state.user.name;
    elements.userPhone.textContent = state.user.phone;

    // Mostrar avatar se existir
    if (state.user.avatar) {
        elements.userAvatar.innerHTML = `<img src="${state.user.avatar}" alt="Avatar"><div class="avatar-overlay">📷</div>`;
    }

    // Conectar WebSocket
    connectSocket();

    // Carregar conversas
    loadConversations();
}

// Handler para trocar foto de perfil
elements.userAvatar.addEventListener('click', () => {
    elements.avatarInput.click();
});

elements.avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Verificar se é imagem
    if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione uma imagem');
        return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const response = await fetch('/api/profile/avatar', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // Atualizar avatar na UI
            elements.userAvatar.innerHTML = `<img src="${data.avatar}" alt="Avatar"><div class="avatar-overlay">📷</div>`;
            state.user.avatar = data.avatar;
            // Salvar no localStorage para persistir
            localStorage.setItem('user', JSON.stringify(state.user));
            alert('Foto de perfil atualizada!');
        } else {
            alert('Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro ao atualizar avatar:', error);
        alert('Erro ao atualizar foto de perfil');
    }

    e.target.value = '';
});

function connectSocket() {
    state.socket = io(window.location.origin, {
        auth: {
            token: state.token
        }
    });

    state.socket.on('connect', () => {
        console.log('✅ Conectado ao servidor');
    });

    state.socket.on('new_message', (message) => {
        handleNewMessage(message);
    });

    state.socket.on('message_sent', (message) => {
        addMessageToUI(message);
    });

    state.socket.on('user_online', (data) => {
        updateUserStatus(data.userId, true);
    });

    state.socket.on('user_offline', (data) => {
        updateUserStatus(data.userId, false);
    });

    state.socket.on('user_typing', (data) => {
        if (state.currentContact && state.currentContact.id === data.userId) {
            if (data.typing) {
                elements.typingIndicator.classList.add('active');
            } else {
                elements.typingIndicator.classList.remove('active');
            }
        }
    });

    state.socket.on('messages_read', (data) => {
        console.log('Mensagens lidas por:', data.userId);
    });

    state.socket.on('disconnect', () => {
        console.log('❌ Desconectado do servidor');
    });
}

// Carregar conversas
async function loadConversations() {
    try {
        const response = await fetch('/api/conversations', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        state.conversations = await response.json();
        renderConversations();
    } catch (error) {
        console.error('Erro ao carregar conversas:', error);
    }
}

function renderConversations(filter = '') {
    const filtered = state.conversations.filter(conv =>
        conv.name.toLowerCase().includes(filter.toLowerCase()) ||
        conv.phone.includes(filter)
    );

    if (filtered.length === 0) {
        elements.conversationsList.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
        <p>Nenhuma conversa encontrada</p>
        <p style="font-size: 14px; margin-top: 8px;">Clique em + para iniciar uma nova</p>
      </div>
    `;
        return;
    }

    elements.conversationsList.innerHTML = filtered.map(conv => `
    <div class="conversation-item ${state.currentContact && state.currentContact.id === conv.id ? 'active' : ''}" 
         data-id="${conv.id}">
      <div class="avatar">${conv.name.charAt(0).toUpperCase()}</div>
      <div class="conversation-content">
        <div class="conversation-header">
          <div class="conversation-name">${conv.name}</div>
          <div class="conversation-time">${formatTime(conv.last_message_time)}</div>
        </div>
        <div class="conversation-preview">${conv.last_message || 'Sem mensagens'}</div>
      </div>
      ${conv.unread_count > 0 ? `<div class="unread-badge">${conv.unread_count}</div>` : ''}
    </div>
  `).join('');

    // Adicionar eventos de clique
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const contactId = parseInt(item.dataset.id);
            const contact = state.conversations.find(c => c.id === contactId);
            openChat(contact);
        });
    });
}

// Buscar conversas
elements.searchInput.addEventListener('input', (e) => {
    renderConversations(e.target.value);
});

// Abrir chat com contato
async function openChat(contact) {
    state.currentContact = contact;

    // Atualizar UI - usar apelido se existir
    elements.emptyState.style.display = 'none';
    elements.activeChat.classList.add('visible');
    elements.contactName.textContent = contact.nickname || contact.name;
    elements.contactName.title = 'Clique para renomear';
    elements.contactName.style.cursor = 'pointer';
    elements.contactStatus.textContent = 'offline';
    elements.contactStatus.classList.remove('online');

    // Mobile: esconder sidebar
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.add('hidden');
    }

    // Carregar mensagens
    await loadMessages(contact.id);

    // Marcar como lido
    state.socket.emit('mark_read', { contactId: contact.id });

    // Focar no input
    elements.messageInput.focus();

    // Atualizar lista de conversas
    renderConversations();
}

// Renomear contato - usando event delegation para garantir que funcione
document.addEventListener('click', async (e) => {
    // Verificar se clicou no nome do contato
    if (!e.target.closest('#contact-name')) return;

    console.log('📝 Clique em renomear contato detectado');

    if (!state.currentContact) {
        console.warn('⚠️ Nenhum contato selecionado');
        return;
    }

    const currentName = state.currentContact.nickname || state.currentContact.name;
    const newName = prompt('Digite o novo nome para este contato:', currentName);

    if (newName === null) return; // Cancelou

    console.log(`📝 Tentando renomear contato ${state.currentContact.id} para "${newName}"`);

    try {
        const response = await fetch('/api/contacts/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                contactId: state.currentContact.id,
                nickname: newName.trim() || null
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Contato renomeado com sucesso');
            state.currentContact.nickname = data.nickname;
            elements.contactName.textContent = data.nickname || state.currentContact.name;

            // Atualizar na lista de conversas
            loadConversations();

            alert('Contato renomeado com sucesso!');
        } else {
            console.error('❌ Erro servidor:', data.error);
            alert('Erro: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Erro ao renomear:', error);
        alert('Erro ao renomear contato: Verifique sua conexão');
    }
});

// Carregar mensagens
async function loadMessages(contactId) {
    try {
        const response = await fetch(`/api/messages/${contactId}`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        const messages = await response.json();
        state.messages[contactId] = messages;

        renderMessages(messages);
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
    }
}

// Gerar HTML para anexos
function getAttachmentHTML(msg) {
    if (!msg.attachment_url) return '';

    const type = msg.attachment_type;
    const url = msg.attachment_url;
    const name = msg.attachment_name || 'arquivo';
    const uniqueId = `audio_${msg.id || Date.now()}`;

    switch (type) {
        case 'image':
            return `<img src="${url}" class="message-image" alt="${name}" onclick="window.open('${url}', '_blank')">`;
        case 'video':
            return `<video src="${url}" class="message-video" controls></video>`;
        case 'audio':
            return `
                <div class="audio-player" data-audio-id="${uniqueId}">
                    <button class="audio-play-btn" onclick="toggleAudio('${uniqueId}', '${url}')">
                        <span class="play-icon">▶</span>
                        <span class="pause-icon" style="display:none">⏸</span>
                    </button>
                    <div class="audio-waveform">
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                        <div class="wave-bar"></div>
                    </div>
                    <span class="audio-duration">0:00</span>
                </div>`;
        default:
            return `<a href="${url}" class="message-document" target="_blank" download="${name}">
                📄 ${name}
            </a>`;
    }
}

// Player de áudio customizado
const audioPlayers = {};

function toggleAudio(audioId, url) {
    const playerEl = document.querySelector(`[data-audio-id="${audioId}"]`);

    // Se já existe um player para este áudio
    if (audioPlayers[audioId]) {
        const audio = audioPlayers[audioId];
        if (audio.paused) {
            // Pausar outros áudios
            Object.keys(audioPlayers).forEach(id => {
                if (id !== audioId) {
                    audioPlayers[id].pause();
                    updateAudioUI(id, false);
                }
            });
            audio.play();
            updateAudioUI(audioId, true);
        } else {
            audio.pause();
            updateAudioUI(audioId, false);
        }
    } else {
        // Criar novo player
        const audio = new Audio(url);
        audioPlayers[audioId] = audio;

        audio.addEventListener('loadedmetadata', () => {
            const duration = formatDuration(audio.duration);
            playerEl.querySelector('.audio-duration').textContent = duration;
        });

        audio.addEventListener('timeupdate', () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            const bars = playerEl.querySelectorAll('.wave-bar');
            const activeBarCount = Math.floor((progress / 100) * bars.length);
            bars.forEach((bar, i) => {
                bar.classList.toggle('active', i < activeBarCount);
            });
        });

        audio.addEventListener('ended', () => {
            updateAudioUI(audioId, false);
            const bars = playerEl.querySelectorAll('.wave-bar');
            bars.forEach(bar => bar.classList.remove('active'));
        });

        // Pausar outros e tocar
        Object.keys(audioPlayers).forEach(id => {
            if (id !== audioId) {
                audioPlayers[id].pause();
                updateAudioUI(id, false);
            }
        });

        audio.play();
        updateAudioUI(audioId, true);
    }
}

function updateAudioUI(audioId, playing) {
    const playerEl = document.querySelector(`[data-audio-id="${audioId}"]`);
    if (!playerEl) return;

    const playIcon = playerEl.querySelector('.play-icon');
    const pauseIcon = playerEl.querySelector('.pause-icon');
    const waveform = playerEl.querySelector('.audio-waveform');

    if (playing) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'inline';
        waveform.classList.add('playing');
    } else {
        playIcon.style.display = 'inline';
        pauseIcon.style.display = 'none';
        waveform.classList.remove('playing');
    }
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderMessages(messages) {
    elements.messagesContainer.innerHTML = messages.map(msg => `
    <div class="message ${msg.sender_id === state.user.id ? 'sent' : 'received'}" data-id="${msg.id}">
      <div class="message-bubble">
        ${msg.forwarded_from ? '<div class="forwarded-tag">⤴️ Encaminhada</div>' : ''}
        ${getAttachmentHTML(msg)}
        ${msg.message ? escapeHtml(msg.message) : ''}
        <div class="message-footer">
          <span class="message-time">${formatTime(msg.created_at)}</span>
          <button class="forward-btn" onclick="forwardMessage(${msg.id})" title="Encaminhar">↪</button>
        </div>
      </div>
    </div>
  `).join('');

    scrollToBottom();
}

// Encaminhar mensagem
async function forwardMessage(messageId) {
    const phone = prompt('Digite o número de telefone do destinatário:');
    if (!phone) return;

    try {
        // Primeiro buscar o usuário pelo telefone
        const userResponse = await fetch('/api/users/find', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ phone })
        });

        const userData = await userResponse.json();

        if (userData.error) {
            alert(userData.error);
            return;
        }

        // Encaminhar a mensagem
        const forwardResponse = await fetch('/api/messages/forward', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                messageId,
                receiverIds: [userData.user.id]
            })
        });

        const forwardData = await forwardResponse.json();

        if (forwardData.success) {
            alert(`Mensagem encaminhada para ${userData.user.name}!`);
            loadConversations();
        } else {
            alert('Erro ao encaminhar: ' + forwardData.error);
        }
    } catch (error) {
        console.error('Erro ao encaminhar:', error);
        alert('Erro ao encaminhar mensagem');
    }
}

function addMessageToUI(message) {
    const contactId = message.sender_id === state.user.id ? message.receiver_id : message.sender_id;

    if (!state.messages[contactId]) {
        state.messages[contactId] = [];
    }

    state.messages[contactId].push(message);

    // Se é a conversa ativa, adicionar à UI
    if (state.currentContact && state.currentContact.id === contactId) {
        const messageHTML = `
      <div class="message ${message.sender_id === state.user.id ? 'sent' : 'received'}" data-id="${message.id}">
        <div class="message-bubble">
          ${message.forwarded_from ? '<div class="forwarded-tag">⤴️ Encaminhada</div>' : ''}
          ${getAttachmentHTML(message)}
          ${message.message ? escapeHtml(message.message) : ''}
          <div class="message-footer">
            <span class="message-time">${formatTime(message.created_at)}</span>
            <button class="forward-btn" onclick="forwardMessage(${message.id})" title="Encaminhar">↪</button>
          </div>
        </div>
      </div>
    `;

        elements.messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        scrollToBottom();
    }

    // Atualizar lista de conversas
    loadConversations();
}

// ============================================
// NOTIFICAÇÕES PUSH
// ============================================

// Pedir permissão para notificações
function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('📬 Permissão de notificação:', permission);
                if (permission === 'granted') {
                    // Testar com uma notificação
                    showNotification('ConsórcioChat', '🔔 Notificações ativadas!');
                }
            });
        } else {
            console.log('📬 Permissão atual:', Notification.permission);
        }
    } else {
        console.log('❌ Navegador não suporta notificações');
    }
}

// Mostrar notificação
function showNotification(title, body, icon = '/icons/icon-512.svg') {
    console.log('📬 Tentando mostrar notificação:', title, body);

    if (!('Notification' in window)) {
        console.log('❌ Notificações não suportadas');
        return;
    }

    if (Notification.permission !== 'granted') {
        console.log('❌ Permissão negada:', Notification.permission);
        return;
    }

    try {
        // Usar Service Worker se disponível (melhor para PWA)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: body,
                    icon: icon,
                    badge: '/icons/icon-512.svg',
                    tag: 'consorcio-message-' + Date.now(),
                    vibrate: [200, 100, 200],
                    requireInteraction: false
                });
            });
        } else {
            // Fallback para notificação normal
            const notification = new Notification(title, {
                body: body,
                icon: icon,
                tag: 'consorcio-message'
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
            };

            setTimeout(() => notification.close(), 5000);
        }
        console.log('✅ Notificação enviada!');
    } catch (error) {
        console.error('❌ Erro na notificação:', error);
    }
}

// Pedir permissão quando logar
window.addEventListener('load', () => {
    if (state.token) {
        setTimeout(requestNotificationPermission, 1000);
    }
});

function handleNewMessage(message) {
    addMessageToUI(message);

    // Se não for a conversa ativa, mostrar notificação
    if (!state.currentContact || state.currentContact.id !== message.sender_id) {
        // Mostrar notificação do navegador
        const messagePreview = message.message
            ? message.message.substring(0, 50) + (message.message.length > 50 ? '...' : '')
            : (message.attachment_type ? '📎 Anexo' : 'Nova mensagem');

        showNotification(
            message.sender_name || 'Nova mensagem',
            messagePreview
        );

        console.log('Nova mensagem de:', message.sender_name);
    } else {
        // Marcar como lido
        state.socket.emit('mark_read', { contactId: message.sender_id });
    }
}

// Enviar mensagem
elements.sendBtn.addEventListener('click', sendMessage);
elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const message = elements.messageInput.value.trim();

    if ((!message && !state.pendingAttachment) || !state.currentContact) return;

    state.socket.emit('send_message', {
        receiverId: state.currentContact.id,
        message: message,
        attachment: state.pendingAttachment
    });

    elements.messageInput.value = '';
    clearAttachment();
    adjustTextareaHeight();
    updateSendButton();

    // Parar de digitar
    state.socket.emit('stop_typing', { receiverId: state.currentContact.id });
}

// Indicador de digitação
elements.messageInput.addEventListener('input', () => {
    updateSendButton();
    adjustTextareaHeight();

    if (state.currentContact) {
        state.socket.emit('typing', { receiverId: state.currentContact.id });

        clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(() => {
            state.socket.emit('stop_typing', { receiverId: state.currentContact.id });
        }, 1000);
    }
});

function updateSendButton() {
    elements.sendBtn.disabled = !elements.messageInput.value.trim() && !state.pendingAttachment;
}

// ============================================
// UPLOAD DE ARQUIVOS
// ============================================

elements.attachBtn.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Mostrar preview
    elements.attachmentName.textContent = `📎 ${file.name}`;
    elements.attachmentPreview.style.display = 'flex';

    // Upload do arquivo
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            state.pendingAttachment = {
                url: data.url,
                type: data.type,
                name: data.name
            };
            updateSendButton();
        } else {
            alert('Erro ao fazer upload: ' + data.error);
            clearAttachment();
        }
    } catch (error) {
        console.error('Erro no upload:', error);
        alert('Erro ao fazer upload');
        clearAttachment();
    }

    elements.fileInput.value = '';
});

elements.removeAttachment.addEventListener('click', clearAttachment);

function clearAttachment() {
    state.pendingAttachment = null;
    elements.attachmentPreview.style.display = 'none';
    elements.attachmentName.textContent = '';
    updateSendButton();
}

// ============================================
// GRAVAÇÃO DE ÁUDIO
// ============================================

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

// Detectar mimeType suportado
function getSupportedMimeType() {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

elements.micBtn.addEventListener('click', startRecording);
elements.stopRecording.addEventListener('click', stopRecording);

async function startRecording() {
    if (!state.currentContact) {
        alert('Selecione um contato primeiro');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};

        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // Parar o stream de áudio
            stream.getTracks().forEach(track => track.stop());

            // Criar blob e fazer upload
            const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
            await uploadAudio(audioBlob, mimeType);
        };

        mediaRecorder.start(1000); // Coletar dados a cada 1 segundo

        // Mostrar indicador de gravação
        elements.recordingIndicator.style.display = 'flex';
        elements.micBtn.classList.add('recording');

        // Timer
        recordingSeconds = 0;
        updateRecordingTime();
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            updateRecordingTime();
        }, 1000);

    } catch (error) {
        console.error('Erro ao acessar microfone:', error);
        alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    // Limpar timer e UI
    clearInterval(recordingTimer);
    elements.recordingIndicator.style.display = 'none';
    elements.micBtn.classList.remove('recording');
}

function updateRecordingTime() {
    const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
    const secs = (recordingSeconds % 60).toString().padStart(2, '0');
    elements.recordingTime.textContent = `${mins}:${secs}`;
}

async function uploadAudio(audioBlob, mimeType) {
    if (!state.currentContact) {
        alert('Selecione um contato primeiro');
        return;
    }

    const extension = mimeType?.includes('mp4') ? '.m4a' :
        mimeType?.includes('ogg') ? '.ogg' : '.webm';

    const formData = new FormData();
    formData.append('file', audioBlob, `audio_${Date.now()}${extension}`);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // Enviar mensagem com áudio automaticamente
            state.socket.emit('send_message', {
                receiverId: state.currentContact.id,
                message: '',
                attachment: {
                    url: data.url,
                    type: 'audio',
                    name: data.name
                }
            });
        } else {
            alert('Erro ao enviar áudio: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('Erro no upload de áudio:', error);
        alert('Erro ao enviar áudio: ' + error.message);
    }
}

function adjustTextareaHeight() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function updateUserStatus(userId, online) {
    if (state.currentContact && state.currentContact.id === userId) {
        elements.contactStatus.textContent = online ? 'online' : 'offline';
        if (online) {
            elements.contactStatus.classList.add('online');
        } else {
            elements.contactStatus.classList.remove('online');
        }
    }
}

// Fechar chat (mobile)
elements.closeChatBtn.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.remove('hidden');
    elements.activeChat.classList.remove('visible');
    elements.emptyState.style.display = 'flex';
    state.currentContact = null;
});

// ============================================
// MODAL DE NOVA CONVERSA
// ============================================

elements.newChatBtn.addEventListener('click', async () => {
    elements.newChatModal.classList.add('active');
    elements.searchUsers.value = '';
    elements.searchUsers.focus();
});

elements.closeModalBtn.addEventListener('click', () => {
    elements.newChatModal.classList.remove('active');
});

elements.newChatModal.addEventListener('click', (e) => {
    if (e.target === elements.newChatModal) {
        elements.newChatModal.classList.remove('active');
    }
});

// Buscar contato por telefone (estilo WhatsApp)
document.getElementById('add-contact-btn').addEventListener('click', async () => {
    const phone = elements.searchUsers.value.trim();

    if (!phone) {
        alert('Digite um número de telefone');
        return;
    }

    try {
        const response = await fetch('/api/users/find', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ phone })
        });

        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        if (data.success && data.user) {
            elements.newChatModal.classList.remove('active');
            elements.searchUsers.value = '';

            // Abrir chat com o contato encontrado
            openChat(data.user);
        }
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        alert('Erro ao buscar contato');
    }
});

async function loadAllUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        const users = await response.json();
        renderUsers(users);
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

function renderUsers(users, filter = '') {
    const filtered = users.filter(user =>
        user.name.toLowerCase().includes(filter.toLowerCase()) ||
        user.phone.includes(filter)
    );

    elements.usersList.innerHTML = filtered.map(user => `
    <div class="user-item" data-id="${user.id}">
      <div class="avatar">${user.name.charAt(0).toUpperCase()}</div>
      <div class="user-item-info">
        <div class="user-item-name">${user.name}</div>
        <div class="user-item-phone">${user.phone}</div>
      </div>
    </div>
  `).join('');

    document.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = parseInt(item.dataset.id);
            const user = users.find(u => u.id === userId);

            elements.newChatModal.classList.remove('active');
            openChat(user);
        });
    });
}

elements.searchUsers.addEventListener('input', async (e) => {
    const response = await fetch('/api/users', {
        headers: {
            'Authorization': `Bearer ${state.token}`
        }
    });

    const users = await response.json();
    renderUsers(users, e.target.value);
});

// ============================================
// UTILIDADES
// ============================================

function formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Se já estiver logado, ir direto para o chat
if (state.token && state.user) {
    showChatScreen();
}
