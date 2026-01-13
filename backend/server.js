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
const multer = require('multer');
const fs = require('fs');

// Configurar multer para upload de arquivos
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        // Permitir imagens, vídeos, áudios e documentos
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/quicktime',
            'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'), false);
        }
    }
});

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
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Inicializar Socket.io
initializeSocket(io);

// Endpoint de upload de arquivos
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const fileType = req.file.mimetype.split('/')[0]; // image, video, audio, application

        res.json({
            success: true,
            url: fileUrl,
            type: fileType === 'application' ? 'document' : fileType,
            name: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload' });
    }
});

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

// Encaminhar mensagem para múltiplos destinatários
app.post('/api/messages/forward', authenticateToken, async (req, res) => {
    try {
        const { messageId, receiverIds } = req.body;
        const senderId = req.user.userId;

        if (!messageId || !receiverIds || receiverIds.length === 0) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        // Buscar mensagem original
        const db = require('./database');
        const originalResult = await db.query(
            `SELECT message, attachment_url, attachment_type, attachment_name FROM messages WHERE id = $1`,
            [messageId]
        );

        if (originalResult.rows.length === 0) {
            return res.status(404).json({ error: 'Mensagem não encontrada' });
        }

        const original = originalResult.rows[0];
        const forwardedMessages = [];

        // Enviar para cada destinatário
        for (const receiverId of receiverIds) {
            const result = await db.query(
                `INSERT INTO messages (sender_id, receiver_id, message, attachment_url, attachment_type, attachment_name, forwarded_from) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [senderId, receiverId, original.message, original.attachment_url, original.attachment_type, original.attachment_name, messageId]
            );
            forwardedMessages.push(result.rows[0]);
        }

        res.json({ success: true, messages: forwardedMessages });
    } catch (error) {
        console.error('Erro ao encaminhar mensagem:', error);
        res.status(500).json({ error: 'Erro ao encaminhar mensagem' });
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
