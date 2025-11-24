const dbPool = require("../config/db"); 
const http = require("axios");

// URLs de servicios
const CENTRAL_API_URL = "https://centralized-wallet-api-production.up.railway.app/api/v1";
const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || "https://billetera-production.up.railway.app/api/v1/wallets"; // Ajusta si es necesario

exports.sendInterbankTransfer = async (req, res) => {
  const { 
    idempotencyKey, // Este es el ID único que genera el frontend (ej: TX-171...)
    sender_wallet, 
    my_phone,      
    target_phone,  
    target_app,    
    amount, 
    currency 
  } = req.body;

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
    
    // 👇 CORRECCIÓN: Agregamos externalTransactionId
    const payloadCentral = {
        fromIdentifier: my_phone,
        toIdentifier: target_phone,
        toAppName: target_app,
        amount: parseFloat(amount),
        externalTransactionId: idempotencyKey // <--- ¡ESTO FALTABA!
    };

    const responseCentral = await http.post(
        `${CENTRAL_API_URL}/sendTransfer`, 
        payloadCentral, 
        configCentral
    );

    const dataCentral = responseCentral.data; 
    console.log("[INTERBANK] API Central respondió OK:", dataCentral);

    // --- PASO B: PREPARAR DATOS PARA DÉBITO LOCAL ---
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
        counterpartyId: counterpartyString 
    }, configWallet);

    console.log("[INTERBANK] Débito local exitoso.");

    // --- PASO D: GUARDAR EN BASE DE DATOS ---
    dbConnection = await dbPool.getConnection();
    await dbConnection.beginTransaction();

    const [txResult] = await dbConnection.execute(
      "INSERT INTO Transaction (sender_wallet, receiver_wallet, amount, currency, status, type) VALUES (?, ?, ?, ?, ?, ?)",
      [sender_wallet, 0, amount, currency || "SOL", "completed", "EXTERNAL"] 
    );
    const transactionId = txResult.insertId;

    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type, description, counterparty_id) VALUES (?, ?, ?, ?, ?, ?)",
      [transactionId, sender_wallet, amount, "debit", `Transferencia a ${target_app}`, counterpartyString]
    );

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
    
    // Mejor log para ver qué falló
    console.error("❌ Error Interbank:", error.response?.data || error.message);
    
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