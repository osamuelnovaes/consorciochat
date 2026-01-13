const db = require('./database');

// Buscar conversas do usuário (lista de contatos com última mensagem)
async function getConversations(userId) {
    const query = `
        SELECT DISTINCT
            u.id,
            u.phone,
            u.name,
            u.avatar,
            u.last_seen,
            (SELECT message FROM messages 
             WHERE (sender_id = $1 AND receiver_id = u.id) 
                OR (sender_id = u.id AND receiver_id = $1)
             ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT created_at FROM messages 
             WHERE (sender_id = $1 AND receiver_id = u.id) 
                OR (sender_id = u.id AND receiver_id = $1)
             ORDER BY created_at DESC LIMIT 1) as last_message_time,
            (SELECT COUNT(*) FROM messages 
             WHERE sender_id = u.id AND receiver_id = $1 AND read = false) as unread_count
        FROM users u
        WHERE u.id != $1 
            AND EXISTS (
                SELECT 1 FROM messages 
                WHERE (sender_id = $1 AND receiver_id = u.id) 
                   OR (sender_id = u.id AND receiver_id = $1)
            )
        ORDER BY last_message_time DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows || [];
}

// Buscar histórico de mensagens entre dois usuários
async function getMessages(userId, contactId, limit = 50) {
    const result = await db.query(
        `SELECT m.*, 
            sender.name as sender_name,
            receiver.name as receiver_name
         FROM messages m
         JOIN users sender ON m.sender_id = sender.id
         JOIN users receiver ON m.receiver_id = receiver.id
         WHERE (sender_id = $1 AND receiver_id = $2) 
            OR (sender_id = $2 AND receiver_id = $1)
         ORDER BY created_at DESC
         LIMIT $3`,
        [userId, contactId, limit]
    );

    // Marcar mensagens como lidas
    await db.query(
        `UPDATE messages SET read = true 
         WHERE sender_id = $1 AND receiver_id = $2 AND read = false`,
        [contactId, userId]
    );

    return (result.rows || []).reverse();
}

// Enviar mensagem
async function sendMessage(senderId, receiverId, message) {
    const insertResult = await db.query(
        `INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *`,
        [senderId, receiverId, message]
    );

    let messageId;
    if (insertResult.rows.length > 0) {
        messageId = insertResult.rows[0].id;
    } else if (insertResult.lastID) {
        messageId = insertResult.lastID;
    }

    const result = await db.query(
        `SELECT m.*, 
            sender.name as sender_name,
            receiver.name as receiver_name
         FROM messages m
         JOIN users sender ON m.sender_id = sender.id
         JOIN users receiver ON m.receiver_id = receiver.id
         WHERE m.id = $1`,
        [messageId]
    );

    return result.rows[0];
}

// Buscar todos os usuários (para adicionar contatos)
async function getAllUsers(currentUserId) {
    const result = await db.query(
        `SELECT id, phone, name, avatar, last_seen 
         FROM users 
         WHERE id != $1
         ORDER BY name`,
        [currentUserId]
    );
    return result.rows || [];
}

// Marcar mensagens como lidas
async function markAsRead(userId, contactId) {
    await db.query(
        `UPDATE messages SET read = true 
         WHERE sender_id = $1 AND receiver_id = $2`,
        [contactId, userId]
    );
    return { success: true };
}

// Buscar ou criar usuário por telefone
async function findOrCreateUserByPhone(phone, currentUserId) {
    // Verificar se usuário já existe
    const existingResult = await db.query(
        `SELECT id, phone, name, avatar, last_seen FROM users WHERE phone = $1`,
        [phone]
    );

    if (existingResult.rows.length > 0) {
        const user = existingResult.rows[0];
        if (user.id === currentUserId) {
            return { error: 'Você não pode adicionar seu próprio número' };
        }
        return { success: true, user };
    }

    // Criar novo usuário
    const insertResult = await db.query(
        `INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *`,
        [phone, `Usuário ${phone.slice(-4)}`]
    );

    // Para SQLite que não suporta RETURNING
    if (insertResult.rows.length === 0 && insertResult.lastID) {
        const newUser = await db.query(
            `SELECT id, phone, name, avatar, last_seen FROM users WHERE id = $1`,
            [insertResult.lastID]
        );
        return { success: true, user: newUser.rows[0], created: true };
    }

    return { success: true, user: insertResult.rows[0], created: true };
}

module.exports = {
    getConversations,
    getMessages,
    sendMessage,
    getAllUsers,
    markAsRead,
    findOrCreateUserByPhone
};
