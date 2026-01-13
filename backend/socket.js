const jwt = require('jsonwebtoken');
const { sendMessage, markAsRead } = require('./messages');

// Armazenar conexões ativas
const activeConnections = new Map();

function initializeSocket(io) {
    io.use((socket, next) => {
        // Autenticar socket com token JWT
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Token não fornecido'));
        }

        jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key_change_in_production', (err, user) => {
            if (err) {
                return next(new Error('Token inválido'));
            }
            socket.user = user;
            next();
        });
    });

    io.on('connection', (socket) => {
        const userId = socket.user.userId;
        console.log(`✅ Usuário ${userId} conectado (Socket: ${socket.id})`);

        // Registrar conexão ativa
        activeConnections.set(userId, socket.id);

        // Notificar outros usuários que este usuário está online
        socket.broadcast.emit('user_online', { userId });

        // Entrar em room pessoal
        socket.join(`user_${userId}`);

        // Enviar mensagem (com suporte a anexos)
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, message, attachment } = data;

                // Salvar mensagem no banco
                const savedMessage = await sendMessage(userId, receiverId, message, attachment);

                // Enviar para o remetente
                socket.emit('message_sent', savedMessage);

                // Enviar para o destinatário (se estiver online)
                io.to(`user_${receiverId}`).emit('new_message', savedMessage);

                console.log(`📨 Mensagem de ${userId} para ${receiverId}${attachment ? ' (com anexo)' : ''}`);
            } catch (error) {
                console.error('Erro ao enviar mensagem:', error);
                socket.emit('error', { message: 'Erro ao enviar mensagem' });
            }
        });

        // Marcar como digitando
        socket.on('typing', (data) => {
            const { receiverId } = data;
            io.to(`user_${receiverId}`).emit('user_typing', {
                userId,
                typing: true
            });
        });

        // Parar de digitar
        socket.on('stop_typing', (data) => {
            const { receiverId } = data;
            io.to(`user_${receiverId}`).emit('user_typing', {
                userId,
                typing: false
            });
        });

        // Marcar mensagens como lidas
        socket.on('mark_read', async (data) => {
            try {
                const { contactId } = data;
                await markAsRead(userId, contactId);

                // Notificar remetente que mensagens foram lidas
                io.to(`user_${contactId}`).emit('messages_read', { userId });
            } catch (error) {
                console.error('Erro ao marcar como lido:', error);
            }
        });

        // Desconexão
        socket.on('disconnect', () => {
            console.log(`❌ Usuário ${userId} desconectado`);
            activeConnections.delete(userId);

            // Notificar outros usuários que este usuário está offline
            socket.broadcast.emit('user_offline', { userId });
        });
    });

    console.log('✅ Socket.io inicializado');
}

// Verificar se usuário está online
function isUserOnline(userId) {
    return activeConnections.has(userId);
}

module.exports = {
    initializeSocket,
    isUserOnline,
    activeConnections
};
