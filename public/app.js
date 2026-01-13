// Estado da aplicação
const state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    socket: null,
    currentContact: null,
    conversations: [],
    messages: {},
    typingTimeout: null
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
    usersList: document.getElementById('users-list')
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

    // Conectar WebSocket
    connectSocket();

    // Carregar conversas
    loadConversations();
}

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

    // Atualizar UI
    elements.emptyState.style.display = 'none';
    elements.activeChat.classList.add('visible');
    elements.contactName.textContent = contact.name;
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

function renderMessages(messages) {
    elements.messagesContainer.innerHTML = messages.map(msg => `
    <div class="message ${msg.sender_id === state.user.id ? 'sent' : 'received'}">
      <div class="message-bubble">
        ${escapeHtml(msg.message)}
        <div class="message-time">${formatTime(msg.created_at)}</div>
      </div>
    </div>
  `).join('');

    scrollToBottom();
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
      <div class="message ${message.sender_id === state.user.id ? 'sent' : 'received'}">
        <div class="message-bubble">
          ${escapeHtml(message.message)}
          <div class="message-time">${formatTime(message.created_at)}</div>
        </div>
      </div>
    `;

        elements.messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        scrollToBottom();
    }

    // Atualizar lista de conversas
    loadConversations();
}

function handleNewMessage(message) {
    addMessageToUI(message);

    // Se não for a conversa ativa, mostrar notificação
    if (!state.currentContact || state.currentContact.id !== message.sender_id) {
        // Aqui você pode adicionar notificações do navegador
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

    if (!message || !state.currentContact) return;

    state.socket.emit('send_message', {
        receiverId: state.currentContact.id,
        message: message
    });

    elements.messageInput.value = '';
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
    elements.sendBtn.disabled = !elements.messageInput.value.trim();
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
    await loadAllUsers();
});

elements.closeModalBtn.addEventListener('click', () => {
    elements.newChatModal.classList.remove('active');
});

elements.newChatModal.addEventListener('click', (e) => {
    if (e.target === elements.newChatModal) {
        elements.newChatModal.classList.remove('active');
    }
});

// Adicionar contato por telefone
document.getElementById('add-contact-btn').addEventListener('click', async () => {
    const phone = elements.searchUsers.value.trim();

    if (!phone) {
        alert('Digite um número de telefone');
        return;
    }

    try {
        const response = await fetch('/api/users/find-or-create', {
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

            // Abrir chat com o novo contato
            openChat(data.user);

            if (data.created) {
                alert(`Contato "${data.user.name}" criado com sucesso!`);
            }
        }
    } catch (error) {
        console.error('Erro ao adicionar contato:', error);
        alert('Erro ao adicionar contato');
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
