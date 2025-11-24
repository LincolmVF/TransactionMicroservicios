// controllers/interbank.controller.js
const dbPool = require("../config/db"); // Tu conexión a BD
const http = require("axios");

// URLs de servicios
const CENTRAL_API_URL = "https://centralized-wallet-api-production.up.railway.app/api/v1";
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || "http://localhost:3002"; // Ajusta tu puerto

/**
 * Orquestador de Transferencias Interbancarias
 * 1. Llama a la API Central para enviar el dinero.
 * 2. Si es exitoso, debita la billetera local.
 * 3. Guarda el registro en la BD local.
 */
exports.sendInterbankTransfer = async (req, res) => {
  const { 
    idempotencyKey, 
    sender_wallet, // ID numérico de la billetera local (ej: 5)
    my_phone,      // Tu celular (ej: "999344881")
    target_phone,  // Celular destino
    target_app,    // Banco destino (ej: "PIXEL MONEY")
    amount, 
    currency 
  } = req.body;

  // 1. Validar Token
  const tokenDelFront = req.headers.authorization;
  if (!tokenDelFront) {
    return res.status(401).json({ error: "No autorizado. Falta token." });
  }

  // Configs de Axios
  const configCentral = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': tokenDelFront, 
      'x-wallet-token': 'luca-token' 
    }
  };

  const configWallet = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': tokenDelFront 
    }
  };

  let dbConnection;

  try {
    // --- PASO A: LLAMAR A LA API CENTRAL ---
    console.log(`[INTERBANK] Solicitando envío a ${target_app}...`);
    
    // Nota: La API Central espera "fromIdentifier", "toIdentifier", etc.
    const responseCentral = await http.post(
        `${CENTRAL_API_URL}/sendTransfer`, 
        {
            fromIdentifier: my_phone,
            toIdentifier: target_phone,
            toAppName: target_app,
            amount: parseFloat(amount)
        }, 
        configCentral
    );

    const dataCentral = responseCentral.data; 
    console.log("[INTERBANK] API Central respondió OK:", dataCentral);

    // --- PASO B: PREPARAR DATOS PARA DÉBITO LOCAL ---
    // Armamos el string que se guardará en la BD para que el frontend muestre el nombre
    // Ej: "Ever Ccencho (PIXEL MONEY)"
    const nombreDestino = dataCentral.data?.userName || "Usuario Externo";
    const bancoDestino = dataCentral.data?.toAppName || target_app;
    const counterpartyString = `${nombreDestino} (${bancoDestino})`; 
    
    const externalTxId = `EXT-${idempotencyKey}`;

    // --- PASO C: DEBITAR BILLETERA LOCAL ---
    console.log(`[INTERBANK] Debitando wallet local ID ${sender_wallet}...`);
    
    await http.post(`${WALLET_SERVICE_URL}/api/v1/wallets/debit`, {
        walletId: sender_wallet,
        amount: amount,
        currency: currency || "SOL",
        externalTransactionId: externalTxId,
        counterpartyId: counterpartyString // <--- Aquí mandamos el texto
    }, configWallet);

    console.log("[INTERBANK] Débito local exitoso.");

    // --- PASO D: GUARDAR EN BASE DE DATOS (Transaction & Ledger) ---
    dbConnection = await dbPool.getConnection();
    await dbConnection.beginTransaction();

    // 1. Insertar en Transaction (Como 'completed' porque ya se hizo todo)
    // Usamos receiver_wallet = 0 o NULL para indicar que es externo
    const [txResult] = await dbConnection.execute(
      "INSERT INTO Transaction (sender_wallet, receiver_wallet, amount, currency, status, type) VALUES (?, ?, ?, ?, ?, ?)",
      [sender_wallet, 0, amount, currency || "SOL", "completed", "EXTERNAL"] 
    );
    const transactionId = txResult.insertId;

    // 2. Insertar en Ledger (Solo el débito, porque el dinero se fue)
    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type, description, counterparty_id) VALUES (?, ?, ?, ?, ?, ?)",
      [transactionId, sender_wallet, amount, "debit", `Transferencia a ${target_app}`, counterpartyString]
    );
    // OJO: En la query de arriba asegúrate que tu tabla Ledger tenga la columna 'counterparty_id' 
    // y que soporte VARCHAR para guardar 'counterpartyString'. Si no, ponlo en description.

    await dbConnection.commit();

    // --- PASO E: RESPONDER ---
    res.status(200).json({
        success: true,
        message: "Transferencia interbancaria realizada",
        details: {
            amount: amount,
            destinatario: counterpartyString,
            operacion: transactionId
        }
    });

  } catch (error) {
    if (dbConnection) await dbConnection.rollback();
    console.error("❌ Error Interbank:", error.message);
    
    // Devolver el error exacto si viene de una API
    if (error.response) {
        return res.status(error.response.status).json(error.response.data);
    }

    res.status(500).json({
        success: false,
        message: "Error procesando transferencia externa",
        error: error.message
    });
  } finally {
    if (dbConnection) dbConnection.release();
  }
};