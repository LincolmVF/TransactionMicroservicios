// controllers/external.controller.js
const axios = require("axios");

// --- CONFIGURACIÓN DE SERVICIOS INTERNOS ---
// Usamos las variables de entorno para flexibilidad, con los fallbacks que ya conocemos.
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "https://userservicesanti.onrender.com/users";
// Nota: Para llamadas internas en Railway, idealmente usa la variable interna, ej: http://billetera.railway.internal:8080
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || "https://billetera-production.up.railway.app/api/v1/wallets";

/**
 * Recibe una transferencia desde una Billetera Externa.
 * Endpoint: POST /api/external/receive
 * Payload esperado:
 * {
 * "destination_phone_number": "999999999",
 * "amount": 50.00,
 * "external_transaction_id": "TX-12345"
 * }
 */
exports.receiveExternalTransfer = async (req, res) => {
  const { destination_phone_number, amount, external_transaction_id } = req.body;

  // 1. VALIDACIÓN BÁSICA
  if (!destination_phone_number || !amount || !external_transaction_id) {
    return res.status(400).json({ error: "Faltan datos obligatorios (destination_phone_number, amount, external_transaction_id)" });
  }

  console.log(`📩 [EXTERNAL] Solicitud recibida: ${external_transaction_id} | Monto: ${amount} | Destino: ${destination_phone_number}`);

  // 2. RESPUESTA INMEDIATA (ACK - Fire & Forget)
  // Respondemos 200 OK al instante para que la otra billetera sepa que recibimos el mensaje.
  res.status(200).json({
    message: "Solicitud recibida. Procesando abono en segundo plano.",
    status: "received",
    external_id: external_transaction_id
  });

  // 3. PROCESO ASÍNCRONO (Background Task)
  // Ejecutamos la lógica pesada sin hacer esperar al cliente externo.
  processExternalDeposit(destination_phone_number, amount, external_transaction_id)
    .catch(err => {
      console.error(`🔥 [EXTERNAL ERROR] Falló el abono para TX ${external_transaction_id}:`, err.message);
      // TODO: Aquí podrías guardar un registro en una tabla de "errores" para reintentar luego.
    });
};

/**
 * Función auxiliar que orquesta los microservicios internos
 */
async function processExternalDeposit(phoneNumber, amount, externalTxId) {
  try {
    // PASO A: Buscar Usuario por Celular (User Service)
    console.log(`🔄 [EXTERNAL] Buscando usuario: ${phoneNumber}...`);
    const userResponse = await axios.get(`${USER_SERVICE_URL}/phone/${phoneNumber}`);
    const userId = userResponse.data.user_id;

    if (!userId) throw new Error(`Usuario con celular ${phoneNumber} no encontrado.`);

    // PASO B: Obtener ID de la Billetera (Wallet Service)
    console.log(`🔄 [EXTERNAL] Buscando wallet para usuario ${userId}...`);
    // Usamos el endpoint de balance para obtener el ID de la wallet
    const walletResponse = await axios.get(`${WALLET_SERVICE_URL}/${userId}/balance`);
    const walletId = walletResponse.data.wallet_id;

    if (!walletId) throw new Error(`Usuario ${userId} no tiene billetera activa.`);

    // PASO C: Realizar el Abono (Wallet Service)
    console.log(`🔄 [EXTERNAL] Abonando S/${amount} a Wallet ${walletId}...`);
    await axios.post(`${WALLET_SERVICE_URL}/credit`, {
      walletId: walletId,
      amount: parseFloat(amount),
      currency: "SOL",
      externalTransactionId: externalTxId,
      counterpartyId: "EXTERNAL_TRANSFER" // Marca para identificar el origen
    });

    console.log(`🚀 [EXTERNAL SUCCESS] Abono exitoso para TX ${externalTxId}`);

  } catch (error) {
    // Mejor manejo de errores de Axios
    const errMsg = error.response?.data?.message || error.message;
    console.error(`❌ [EXTERNAL FAIL] Error procesando depósito: ${errMsg}`);
    throw error; // Re-lanzamos para que el log del controlador lo capture
  }
}