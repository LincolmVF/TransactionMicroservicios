// controllers/transaction.controller.js

// --- 1. Importar Conexiones y Librerías ---
const dbPool = require("../config/db"); // Importa la BD
const redisClient = require("../config/redis"); // Importa Redis
const amqp = require("amqplib");
const http = require("axios"); 

// Leemos las URLs de los .env
const rmqUrl = process.env.RABBITMQ_URL;
const rmqQueue = "history_queue";
// Esta es la URL de tu Wallet Service real
const walletServiceUrl = process.env.WALLET_SERVICE_URL;

// --- 2. Lógica de CREAR Transacción ---
exports.createTransaction = async (req, res) => {
  const { idempotencyKey, sender_wallet, receiver_wallet, amount, currency } = req.body;

  // --- A. Verificar Idempotencia (RF-03) ---
  // Protegemos la llamada a Redis por si el servicio está apagado
  const key = `idempotency:${idempotencyKey}`;
  let isNewRequest = false;

  try {
    // Solo intentamos usar Redis si el cliente existe y está listo
    if (redisClient && redisClient.status === 'ready') {
        const result = await redisClient.set(key, "processing", "EX", 3600, "NX");
        if (result !== "OK") {
            const cachedResult = await redisClient.get(key);
            if (cachedResult !== "processing") {
                return res.status(200).send(JSON.parse(cachedResult));
            }
            return res.status(409).send({ message: "Transacción en proceso." });
        }
    }
    isNewRequest = true;
  } catch (err) {
    console.warn("⚠️ Redis no disponible o error de conexión. Continuando sin check de idempotencia.", err.message);
    // No bloqueamos la transacción, permitimos que continúe
  }

  // --- DEFINICIÓN DE IDs DE PASO (SAGA) ---
  // Generamos IDs únicos para cada paso que le pediremos al Wallet Service
  const debitStepId = `${idempotencyKey}-debit`; 
  const creditStepId = `${idempotencyKey}-credit`;

  let dbConnection;
  try {
    // --- B. Lógica de Wallet Service (EL FLUJO RIESGOSO) ---

    // 1. Intentar debitar al emisor
    try {
      console.log(`[SAGA] Iniciando DEBITO a wallet ${sender_wallet}...`);
      await http.post(`${walletServiceUrl}/api/v1/wallets/debit`, {
        walletId: sender_wallet,
        amount: amount,
        currency: currency, // <--- ¡IMPORTANTE: Agregado para pasar validación!
        externalTransactionId: debitStepId, 
      });

      console.log("[SAGA] Wallet Service: Débito exitoso.");
    } catch (debitError) {
      // Si el débito falla (fondos insuficientes, etc.)
      console.error(
        "Wallet Service rechazó el débito:",
        debitError.response?.data || debitError.message
      );
      // Limpiamos Redis si falló
      try { if (isNewRequest && redisClient && redisClient.status === 'ready') await redisClient.del(key); } catch(e){}
      
      return res
        .status(debitError.response?.status || 400)
        .send(
          debitError.response?.data || {
            message: "Error al contactar Wallet Service (Debit)",
          }
        );
    }

    // 2. Intentar acreditar al receptor
    try {
      console.log(`[SAGA] Iniciando CREDITO a wallet ${receiver_wallet}...`);
      await http.post(`${walletServiceUrl}/api/v1/wallets/credit`, {
        walletId: receiver_wallet,
        amount: amount,
        currency: currency, // <--- ¡IMPORTANTE: Agregado!
        externalTransactionId: creditStepId,
      });
      console.log("[SAGA] Wallet Service: Crédito exitoso.");
    } catch (creditError) {
      // !!! PELIGRO !!!
      // El débito fue exitoso, pero el crédito falló.
      console.error(
        "¡CRÍTICO! El débito se hizo, pero el crédito falló:",
        creditError.response?.data || creditError.message
      );

      // Intentamos hacer un "rollback" manual llamando a /credit en el emisor
      console.log("[SAGA] Intentando revertir el débito (Compensación)...");
      try {
        await http.post(`${walletServiceUrl}/api/v1/wallets/credit`, {
          walletId: sender_wallet, // El emisor original
          amount: amount, // El mismo monto
          currency: currency, // <--- ¡IMPORTANTE: Agregado para el rollback!
          externalTransactionId: `rollback-${idempotencyKey}`,
        });
        console.log("[SAGA] Débito revertido (compensado).");
      } catch (rollbackError) {
        console.error(
          "¡¡¡FALLO CRÍTICO IRRECUPERABLE!!! El débito se hizo, el crédito falló y la compensación TAMBIÉN falló."
        );
        // Aquí se debe alertar a un administrador
      }

      try { if (isNewRequest && redisClient && redisClient.status === 'ready') await redisClient.del(key); } catch(e){}

      return res
        .status(creditError.response?.status || 500)
        .send(
          creditError.response?.data || {
            message: "Error al contactar Wallet Service (Credit)",
          }
        );
    }

    // --- C. Transacción ACID (Tu Ledger Local) ---
    // Si AMBOS, débito y crédito, fueron exitosos,
    // ahora lo guardamos en nuestra "fuente de la verdad".
    console.log("Guardando en Ledger local...");
    dbConnection = await dbPool.getConnection();
    await dbConnection.beginTransaction();

    const [txResult] = await dbConnection.execute(
      "INSERT INTO Transaction (sender_wallet, receiver_wallet, amount, currency, status) VALUES (?, ?, ?, ?, ?)",
      [sender_wallet, receiver_wallet, amount, currency, "completed"] // Ya pasó por Wallet Service, así que es completed
    );
    const transactionId = txResult.insertId;

    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type) VALUES (?, ?, ?, ?)",
      [transactionId, sender_wallet, amount, "debit"]
    );

    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type) VALUES (?, ?, ?, ?)",
      [transactionId, receiver_wallet, amount, "credit"]
    );

    // No necesitamos hacer UPDATE status porque ya lo insertamos como 'completed'
    // Pero si mantienes el flujo anterior de insert 'processing' -> update 'completed', descomenta esto:
    /*
    await dbConnection.execute(
      "UPDATE Transaction SET status = ? WHERE Transaction_id = ?",
      ["completed", transactionId]
    );
    */

    await dbConnection.commit();
    console.log("Ledger local guardado.");

    // --- D. Notificar a History Service (RF-05 y RNF-03) ---
    // Protegemos RabbitMQ por si el servicio está apagado
    try {
      if (rmqUrl) {
          const rmqConn = await amqp.connect(rmqUrl);
          const channel = await rmqConn.createChannel();
          await channel.assertQueue(rmqQueue, { durable: true });
          const msg = { transaction_id: transactionId, status: "completed" };
          channel.sendToQueue(rmqQueue, Buffer.from(JSON.stringify(msg)), {
            persistent: true,
          });
          await channel.close();
          await rmqConn.close();
      }
    } catch (rmqErr) {
      console.warn(
        "Fallo al notificar a RabbitMQ (la transacción SÍ fue exitosa en BD):",
        rmqErr.message
      );
    }

    // --- E. Actualizar Redis ---
    const finalResult = {
      transaction_id: transactionId,
      status: "completed",
      amount,
      currency,
      sender_wallet,
      receiver_wallet,
    };

    try {
        if (redisClient && redisClient.status === 'ready') {
            await redisClient.set(key, JSON.stringify(finalResult), "EX", 86400);
        }
    } catch(e) { console.warn("No se pudo actualizar caché Redis"); }

    // --- F. Responder al Cliente ---
    res.status(201).send(finalResult);

  } catch (error) {
    if (dbConnection) await dbConnection.rollback();
    try { if (isNewRequest && redisClient && redisClient.status === 'ready') await redisClient.del(key); } catch(e){}
    
    console.error("Error en la transacción:", error.message);
    res
      .status(500)
      .send({
        message: "Error al procesar la transacción",
        error: error.message,
      });
  } finally {
    if (dbConnection) dbConnection.release();
  }
};

// --- 3. Lógica de LEER TODOS ---
exports.findAllTransactions = async (req, res) => {
  try {
    const [rows] = await dbPool.query(
      "SELECT * FROM Transaction ORDER BY timestamp DESC"
    );
    res.status(200).send(rows);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error al leer transacciones", error: error.message });
  }
};

// --- 4. Lógica de LEER UNO ---
exports.findOneTransaction = async (req, res) => {
  const { id } = req.params;
  try {
    const [txRows] = await dbPool.query(
      "SELECT * FROM Transaction WHERE Transaction_id = ?",
      [id]
    );

    if (txRows.length === 0) {
      return res.status(404).send({ message: "Transacción no encontrada." });
    }

    const [ledgerRows] = await dbPool.query(
      "SELECT * FROM Ledger WHERE transaction_id = ?",
      [id]
    );

    const transaction = txRows[0];
    transaction.ledger_entries = ledgerRows;

    res.status(200).send(transaction);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error al leer transacción", error: error.message });
  }
};

// --- 5. Lógica de REVERTIR ---
exports.reverseTransaction = async (req, res) => {
  const { id } = req.params;
  let dbConnection;

  try {
    dbConnection = await dbPool.getConnection();

    const [txRows] = await dbConnection.query(
      "SELECT * FROM Transaction WHERE Transaction_id = ?",
      [id]
    );
    if (txRows.length === 0) {
      return res
        .status(404)
        .send({ message: "Transacción original no encontrada." });
    }

    const originalTx = txRows[0];

    if (originalTx.status === "reversed") {
      return res
        .status(400)
        .send({ message: "Esta transacción ya fue revertida." });
    }
    if (originalTx.status !== "completed") {
      return res
        .status(400)
        .send({
          message: "Solo se pueden revertir transacciones completadas.",
        });
    }

    // OJO: Aquí deberías llamar al Wallet Service para hacer la reversión real del dinero
    // (Llamar a credit para el sender original y debit para el receiver original)
    // Por simplicidad en este ejemplo, solo estamos actualizando la BD local.

    await dbConnection.beginTransaction();

    const [reverseTxResult] = await dbConnection.execute(
      "INSERT INTO Transaction (sender_wallet, receiver_wallet, amount, currency, status) VALUES (?, ?, ?, ?, ?)",
      [
        originalTx.receiver_wallet,
        originalTx.sender_wallet,
        originalTx.amount,
        originalTx.currency,
        "processing",
      ]
    );
    const reverseTxId = reverseTxResult.insertId;

    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type) VALUES (?, ?, ?, ?)",
      [reverseTxId, originalTx.receiver_wallet, originalTx.amount, "debit"]
    );

    await dbConnection.execute(
      "INSERT INTO Ledger (transaction_id, wallet_id, amount, type) VALUES (?, ?, ?, ?)",
      [reverseTxId, originalTx.sender_wallet, originalTx.amount, "credit"]
    );

    await dbConnection.execute(
      "UPDATE Transaction SET status = ? WHERE Transaction_id = ?",
      ["completed", reverseTxId]
    );

    await dbConnection.execute(
      "UPDATE Transaction SET status = ? WHERE Transaction_id = ?",
      ["reversed", originalTx.Transaction_id]
    );

    await dbConnection.commit();

    res
      .status(201)
      .send({
        message: "Transacción revertida exitosamente",
        new_transaction_id: reverseTxId,
      });
  } catch (error) {
    if (dbConnection) await dbConnection.rollback();
    console.error("Error al revertir transacción:", error.message);
    res
      .status(500)
      .send({ message: "Error al revertir transacción", error: error.message });
  } finally {
    if (dbConnection) dbConnection.release();
  }
};