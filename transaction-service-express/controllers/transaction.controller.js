// controllers/transaction.controller.js

// --- 1. Importar Conexiones y Librerías ---
const dbPool = require("../config/db"); // Importa la BD
const redisClient = require("../config/redis"); // Importa Redis
const amqp = require("amqplib");
const http = require("axios"); // Asegúrate de que axios esté instalado (npm install axios)

// Leemos las URLs de los .env
const rmqUrl = process.env.RABBITMQ_URL;
const rmqQueue = "history_queue";
// Esta es la URL de tu Wallet Service real
const walletServiceUrl = process.env.WALLET_SERVICE_URL;

// --- 2. Lógica de CREAR Transacción ---
exports.createTransaction = async (req, res) => {
  const { idempotencyKey, sender_wallet, receiver_wallet, amount, currency } =
    req.body;

  // --- A. Verificar Idempotencia (RF-03) ---
  const key = `idempotency:${idempotencyKey}`;
  let isNewRequest = false;
  try {
    const result = await redisClient.set(key, "processing", "EX", 3600, "NX");
    if (result !== "OK") {
      const cachedResult = await redisClient.get(key);
      if (cachedResult !== "processing") {
        return res.status(200).send(JSON.parse(cachedResult));
      }
      return res.status(409).send({ message: "Transacción en proceso." });
    }
    isNewRequest = true;
  } catch (err) {
    console.error("Error de Redis:", err);
    return res.status(500).send({ message: "Error interno (Redis)" });
  }

  // --- DEFINICIÓN DE IDs DE PASO (SAGA) ---
  // Generamos IDs únicos para cada paso que le pediremos al Wallet Service
  const debitStepId = `${idempotencyKey}-debit`; // <-- CAMBIO AQUÍ
  const creditStepId = `${idempotencyKey}-credit`; // <-- CAMBIO AQUÍ

  let dbConnection;
  try {
    // --- B. Lógica de Wallet Service (EL FLUJO RIESGOSO QUE PEDISTE) ---

    // 1. Intentar debitar al emisor
    try {
      console.log("Llamando a Wallet Service (DEBIT)...");
      await http.post(`${walletServiceUrl}/api/v1/wallets/debit`, {
        walletId: sender_wallet,
        amount: amount,
        externalTransactionId: debitStepId, // Usamos la idempotencyKey como ID externo
      });

      console.log("Wallet Service: Débito exitoso.");
    } catch (debitError) {
      // Si el débito falla (fondos insuficientes, etc.)
      console.error(
        "Wallet Service rechazó el débito:",
        debitError.response?.data || debitError.message
      );
      if (isNewRequest) await redisClient.del(key);
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
      console.log("Llamando a Wallet Service (CREDIT)...");
      await http.post(`${walletServiceUrl}/api/v1/wallets/credit`, {
        walletId: receiver_wallet,
        amount: amount,
        externalTransactionId: creditStepId,
      });
      console.log("Wallet Service: Crédito exitoso.");
    } catch (creditError) {
      // !!! PELIGRO !!!
      // El débito fue exitoso, pero el crédito falló.
      console.error(
        "¡CRÍTICO! El débito se hizo, pero el crédito falló:",
        creditError.response?.data || creditError.message
      );

      // Intentamos hacer un "rollback" manual llamando a /credit en el emisor
      // Esto es una "transacción de compensación"
      console.log("Intentando revertir el débito...");
      try {
        await http.post(`${walletServiceUrl}/api/v1/wallets/credit`, {
          walletId: sender_wallet, // El emisor original
          amount: amount, // El mismo monto
          externalTransactionId: `rollback-${idempotencyKey}`,
        });
        console.log("Débito revertido (compensado).");
      } catch (rollbackError) {
        console.error(
          "¡¡¡FALLO CRÍTICO IRRECUPERABLE!!! El débito se hizo, el crédito falló y la compensación TAMBIÉN falló."
        );
        // Aquí se debe alertar a un administrador
      }

      if (isNewRequest) await redisClient.del(key);
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
      [sender_wallet, receiver_wallet, amount, currency, "processing"]
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

    await dbConnection.execute(
      "UPDATE Transaction SET status = ? WHERE Transaction_id = ?",
      ["completed", transactionId]
    );

    await dbConnection.commit();
    console.log("Ledger local guardado.");

    // --- D. Notificar a History Service (RF-05 y RNF-03) ---
    try {
      const rmqConn = await amqp.connect(rmqUrl);
      const channel = await rmqConn.createChannel();
      await channel.assertQueue(rmqQueue, { durable: true });
      const msg = { transaction_id: transactionId, status: "completed" };
      channel.sendToQueue(rmqQueue, Buffer.from(JSON.stringify(msg)), {
        persistent: true,
      });
      await channel.close();
      await rmqConn.close();
    } catch (rmqErr) {
      console.error(
        "Fallo al notificar a RabbitMQ (la transacción SÍ fue exitosa):",
        rmqErr.message
      );
    }

    // --- E. Actualizar Redis ---
    const finalResult = {
      transaction_id: transactionId,
      status: "completed",
      amount,
      sender_wallet,
      receiver_wallet,
    };
    await redisClient.set(key, JSON.stringify(finalResult), "EX", 86400);

    // --- F. Responder al Cliente ---
    res.status(201).send(finalResult);
  } catch (error) {
    if (dbConnection) await dbConnection.rollback();
    if (isNewRequest) await redisClient.del(key);
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

    // Esta lógica de reversión está actuando sobre TU ledger local.
    // Faltaría llamar a /debit y /credit del Wallet Service para la reversión.
    // Pero por ahora, actualiza el ledger local como en la prueba anterior.

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
