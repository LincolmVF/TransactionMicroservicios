const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar el Token (JWT)
 * Esto valida la "firma digital" (Autenticación)
 */
const checkJwt = (req, res, next) => {
    // 1. Obtener el token del header
    const authHeader = req.headers['authorization'];
    // El formato es: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Si no hay token, no está autorizado
        return res.status(401).json({ error: 'No autorizado: No hay token' });
    }

    try {
        // 2. Validar la "firma digital"
        // jwt.verify hace 2 cosas:
        // a) Comprueba que la firma sea válida usando tu JWT_SECRET
        // b) Si es válida, te devuelve el "payload" (los datos de adentro)
        const payload = jwt.verify(token, JWT_SECRET);

        // 3. ¡Éxito! Adjuntamos el payload al request
        // Ahora, todos los controladores que sigan tendrán acceso a req.user
        req.user = payload; // ej: { userId: 'user-goku', role: 'user' }

        // 4. Damos pase al siguiente (al controlador)
        next();

    } catch (err) {
        // Si la firma es inválida o el token expiró, 'verify' lanza un error
        console.error('Error de token:', err.message);
        return res.status(401).json({ error: 'No autorizado: Token inválido' });
    }
};

module.exports = { checkJwt };