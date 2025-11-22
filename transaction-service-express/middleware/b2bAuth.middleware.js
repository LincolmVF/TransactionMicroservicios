require('dotenv').config();

const b2bAuthMiddleware = (req, res, next) => {
  // 1. Definimos el nombre del Header que pactamos
  // Nota: Express convierte los headers a minúsculas automáticamente
  const HEADER_NAME = 'x-wallet-b2b-key';

  // 2. Obtenemos la clave que nos enviaron
  const receivedKey = req.headers[HEADER_NAME];

  // 3. Obtenemos la clave maestra real desde el .env
  const secretKey = process.env.B2B_SECRET_TOKEN;

  // --- VALIDACIONES DE SEGURIDAD ---

  // A. Si no configuraste la clave en el servidor, bloqueamos todo por seguridad
  if (!secretKey) {
    console.error("⛔ ERROR CRÍTICO: Falta B2B_SECRET_TOKEN en variables de entorno.");
    return res.status(500).json({ message: "Error de configuración de seguridad." });
  }

  // B. Si no enviaron el header
  if (!receivedKey) {
    return res.status(401).json({ message: `Acceso denegado. Falta el header: ${HEADER_NAME}` });
  }

  // C. Comparación estricta (La llave debe ser idéntica)
  if (receivedKey !== secretKey) {
    console.warn(`⚠️ Intento de acceso no autorizado desde IP: ${req.ip}`);
    return res.status(403).json({ message: "Acceso prohibido. Llave incorrecta." });
  }

  // 4. Si todo está bien, pasamos
  console.log("✅ Acceso B2B autorizado.");
  next();
};

module.exports = b2bAuthMiddleware;