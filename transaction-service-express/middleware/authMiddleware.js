const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // 1. Obtener el header Authorization
  const authHeader = req.headers['authorization'];
  
  // 2. Extraer el token (formato "Bearer TOKEN")
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Acceso denegado: Token no proporcionado" });
  }

  // 3. Preparar la clave secreta
  // CRÍTICO: Usamos la clave como STRING PLANO (sin Buffer.from),
  // ya que tu código base de Java firma la clave Hexadecimal como texto literal.
  const secretKey = process.env.JWT_SECRET;

  if (!secretKey) {
    console.error("ERROR CRÍTICO: JWT_SECRET no está definido en el .env");
    return res.status(500).json({ message: "Error de configuración del servidor" });
  }

  // 4. Verificar el token
  jwt.verify(token, secretKey, (err, userDecoded) => {
    if (err) {
      console.error("Error de validación de token:", err.message);
      return res.status(403).json({ message: "Token inválido o expirado" });
    }

    // 5. Inyectar datos del usuario en la request
    req.user = userDecoded; 
    
    next(); // Continuar al controller
  });
};

module.exports = authenticateToken;