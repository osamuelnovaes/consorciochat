require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { sendVerificationCode, verifyCode, updateProfile } = require('./auth');
const { authenticateToken } = require('./middleware');
const { getConversations, getMessages, getAllUsers, findUserByPhone } = require('./messages');
const { initializeSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Inicializar Socket.io
initializeSocket(io);

// Rotas de autenticação
app.post('/api/auth/send-code', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Número de telefone obrigatório' });
        }

        const result = await sendVerificationCode(phone);
        res.json(result);
    } catch (error) {
        console.error('Erro ao enviar código:', error);
        res.status(500).json({ error: 'Erro ao enviar código de verificação' });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { phone, code } = req.body;

        if (!phone || !code) {
            return res.status(400).json({ error: 'Telefone e código obrigatórios' });
        }

        const result = await verifyCode(phone, code);
        res.json(result);
    } catch (error) {
        console.error('Erro ao verificar código:', error);
        res.status(500).json({ error: 'Erro ao verificar código' });
    }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = await updateProfile(req.user.userId, req.body);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

// Rotas de mensagens
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await getConversations(req.user.userId);
        res.json(conversations);
    } catch (error) {
        console.error('Erro ao buscar conversas:', error);
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});

app.get('/api/messages/:contactId', authenticateToken, async (req, res) => {
    try {
        const messages = await getMessages(req.user.userId, req.params.contactId);
        res.json(messages);
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await getAllUsers(req.user.userId);
        res.json(users);
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

// Buscar contato por telefone (estilo WhatsApp)
app.post('/api/users/find', authenticateToken, async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Número de telefone obrigatório' });
        }

        const result = await findUserByPhone(phone, req.user.userId);

        if (result.error) {
            return res.status(404).json({ error: result.error });
        }

        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        res.status(500).json({ error: 'Erro ao buscar contato' });
    }
});

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 ConsórcioChat - Plataforma de Comunicação\n`);
});
