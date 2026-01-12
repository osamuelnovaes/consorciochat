const jwt = require('jsonwebtoken');
const db = require('./database');

// Gerar código de verificação de 6 dígitos
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Enviar código de verificação
async function sendVerificationCode(phone) {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    try {
        await db.query(
            `INSERT INTO verification_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
            [phone, code, expiresAt.toISOString()]
        );

        // Tentar enviar SMS real se credenciais estiverem configuradas
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && fromNumber &&
            accountSid !== 'your_account_sid_here' && accountSid.length > 10) {

            try {
                const client = require('twilio')(accountSid, authToken);

                await client.messages.create({
                    body: `Seu código de verificação ConsórcioChat é: ${code}`,
                    from: fromNumber,
                    to: phone.startsWith('+') ? phone : `+55${phone}`
                });

                console.log(`SMS enviado para ${phone}`);
                return { success: true, message: 'Código enviado por SMS' };
            } catch (error) {
                console.error('Erro ao enviar SMS via Twilio:', error.message);
                console.log(`\n📱 CÓDIGO DE VERIFICAÇÃO PARA ${phone}: ${code} (Fallback)\n`);
                return { success: true, message: 'Código gerado (falha no envio de SMS)' };
            }
        } else {
            // Modo desenvolvimento (sem credenciais)
            console.log(`\n📱 CÓDIGO DE VERIFICAÇÃO PARA ${phone}: ${code}\n`);
            return { success: true, message: 'Código enviado (Simulação)' };
        }
    } catch (err) {
        throw err;
    }
}

// Verificar código
async function verifyCode(phone, code) {
    try {
        const result = await db.query(
            `SELECT * FROM verification_codes 
             WHERE phone = $1 AND code = $2 AND verified = false 
             AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [phone, code]
        );

        const row = result.rows[0];

        if (!row) {
            return { success: false, message: 'Código inválido ou expirado' };
        }

        // Marcar como verificado
        await db.query(
            `UPDATE verification_codes SET verified = true WHERE id = $1`,
            [row.id]
        );

        // Criar ou atualizar usuário
        const user = await createOrUpdateUser(phone);

        const token = jwt.sign(
            { userId: user.id, phone: user.phone },
            process.env.JWT_SECRET || 'default_secret_key_change_in_production',
            { expiresIn: '30d' }
        );

        return { success: true, token, user };
    } catch (err) {
        throw err;
    }
}

// Criar ou atualizar usuário
async function createOrUpdateUser(phone) {
    try {
        const result = await db.query(
            `SELECT * FROM users WHERE phone = $1`,
            [phone]
        );

        if (result.rows.length > 0) {
            // Atualizar last_seen
            await db.query(
                `UPDATE users SET last_seen = NOW() WHERE id = $1`,
                [result.rows[0].id]
            );
            return result.rows[0];
        } else {
            // Criar novo usuário
            const insertResult = await db.query(
                `INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *`,
                [phone, `Usuário ${phone.slice(-4)}`]
            );

            // Para SQLite que não suporta RETURNING
            if (insertResult.rows.length === 0 && insertResult.lastID) {
                const newUser = await db.query(
                    `SELECT * FROM users WHERE id = $1`,
                    [insertResult.lastID]
                );
                return newUser.rows[0];
            }

            return insertResult.rows[0];
        }
    } catch (err) {
        throw err;
    }
}

// Atualizar perfil do usuário
async function updateProfile(userId, data) {
    const { name, avatar } = data;

    try {
        await db.query(
            `UPDATE users SET name = $1, avatar = $2 WHERE id = $3`,
            [name, avatar, userId]
        );

        const result = await db.query(
            `SELECT * FROM users WHERE id = $1`,
            [userId]
        );

        return result.rows[0];
    } catch (err) {
        throw err;
    }
}

module.exports = {
    sendVerificationCode,
    verifyCode,
    updateProfile
};
