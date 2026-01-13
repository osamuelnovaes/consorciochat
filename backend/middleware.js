const jwt = require('jsonwebtoken');

// Middleware de autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'default_secret_key_change_in_production';

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.error('Token error:', err.message);
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

module.exports = {
    authenticateToken
};
