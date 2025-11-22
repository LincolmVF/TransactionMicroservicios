const axios = require("axios");
const jwt = require("jsonwebtoken"); // 1. Importamos la librería

// --- CONFIGURACIÓN ---
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "https://userservicesanti.onrender.com/users";
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL2 || "https://billetera-production.up.railway.app/api/v1/wallets";
const URL_WALLET_SERVICE = 'https://billetera-production.up.railway.app/api/v1/wallets';

// TU SECRETO (Asegúrate que sea EL MISMO que usan los otros servicios para verificar)
const JWT_SECRET = process.env.JWT_SECRET || "08af2447a30c9c090b3595e6b45cead32eb587dcb1892aae31f073dcb31bce95";

/**
 * Genera un token temporal para comunicación entre servicios (S2S).
 * Este token simula ser un administrador o el sistema mismo.
 */
function generateSystemToken() {
  const payload = {
    role: "admin",          // O el rol que tus servicios requieran para dar paso
    service: "external_gw", // Identificador de este servicio
    type: "system_token"
  };
  
  // Firmamos el token. Expira en 5 minutos (suficiente para la transacción)
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
}

exports.receiveExternalTransfer = async (req, res) => {
  const { destination_phone_number, amount, external_transaction_id } = req.body;

  // 1. VALIDACIÓN BÁSICA
  if (!destination_phone_number || !amount || !external_transaction_id) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  console.log(`📩 [EXTERNAL] Solicitud: ${external_transaction_id} | Monto: ${amount} | Destino: ${destination_phone_number}`);

  // 2. RESPUESTA INMEDIATA (ACK)
  res.status(200).json({
    message: "Solicitud recibida. Procesando abono en segundo plano.",
    status: "received",
    external_id: external_transaction_id
  });

  // 3. PROCESO ASÍNCRONO
  processExternalDeposit(destination_phone_number, amount, external_transaction_id)
    .catch(err => {
      console.error(`🔥 [EXTERNAL ERROR] Falló el abono para TX ${external_transaction_id}:`, err.message);
    });
};

async function processExternalDeposit(phoneNumber, amount, externalTxId) {
  try {
    // GENERAMOS EL TOKEN (Firma del sistema)
    const token = generateSystemToken();
    
    // CONFIGURAMOS LOS HEADERS COMUNES
    const config = {
      headers: {
        Authorization: `Bearer ${token}`, // Aquí inyectamos el token
        "Content-Type": "application/json"
      }
    };

    // PASO A: Buscar Usuario (Con token)
    console.log(`🔄 [EXTERNAL] Buscando usuario: ${phoneNumber}...`);
    const userResponse = await axios.get(`${USER_SERVICE_URL}/phone/${phoneNumber}`, config);
    const userId = userResponse.data.user_id;

    if (!userId) throw new Error(`Usuario con celular ${phoneNumber} no encontrado.`);

    // PASO B: Obtener Wallet ID (Con token)
    console.log(`🔄 [EXTERNAL] Buscando wallet para usuario ${userId}...`);
    const walletResponse = await axios.get(`${WALLET_SERVICE_URL}/${userId}/balance`, config);
    const walletId = walletResponse.data.wallet_id;

    if (!walletId) throw new Error(`Usuario ${userId} no tiene billetera activa.`);

    // PASO C: Realizar el Abono (Con token)
    console.log(`🔄 [EXTERNAL] Abonando S/${amount} a Wallet ${walletId}...`);
    await axios.post(
      `${WALLET_SERVICE_URL}/credit`, 
      {
        walletId: walletId,
        amount: parseFloat(amount),
        currency: "SOL",
        externalTransactionId: externalTxId,
        counterpartyId: "EXTERNAL_TRANSFER"
      },
      config // Pasamos los headers aquí también
    );

    console.log(`🚀 [EXTERNAL SUCCESS] Abono exitoso para TX ${externalTxId}`);

  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error(`❌ [EXTERNAL FAIL] Error procesando depósito: ${errMsg}`);
    // Imprimimos el status por si es un 401 (No autorizado) o 403 (Prohibido)
    if (error.response) console.error(`   Status Code: ${error.response.status}`);
    throw error;
  }
}