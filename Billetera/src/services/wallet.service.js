// src/services/wallet.service.js

// --- 1. Importar la conexión a la DB ---
// Ya no necesitamos los mocks, ahora importamos el "pool"
// que creamos en 'db.js'.
const { pool } = require("../config/db");

// --- 2. Lógica de Negocio (El Servicio) ---

/**
 * Servicio para crear una nueva wallet (RF1) - VERSIÓN SQL
 * @param {string} userId - El ID del usuario
 * @returns {object} La nueva wallet creada
 * @throws {Error} Si la wallet ya existe
 */
const create = async (userId) => {
  // **Punto Clave 1: Conexión**
  // Todas nuestras funciones de DB ahora deben ser 'async'.
  // 'conn' es nuestra conexión "prestada" del pool.
  let conn;
  try {
    conn = await pool.getConnection();

    // **Punto Clave 2: El Query (SQL)**
    // Este es el comando que le damos a MariaDB.
    // Usamos '?' como 'placeholders' (marcadores) para
    // insertar variables de forma segura y evitar "SQL Injection".
    const sql = "INSERT INTO Wallets (user_id) VALUES (?)";

    // El 'userId' se insertará donde está el '?'
    const result = await conn.query(sql, [userId]);

    // Si el INSERT funciona, 'result' nos da el ID de la fila creada
    const newWalletId = Number(result.insertId);

    // Si falló por alguna razón y no creó el ID
    if (!newWalletId) {
      throw new Error("No se pudo crear la wallet en la DB.");
    }

    // **Punto Clave 3: Devolver la wallet creada**
    // Hacemos un SELECT para devolver el objeto completo,
    // tal como lo hacíamos con el mock.
    const createdWallet = await getWalletById(newWalletId, conn); // Reutilizamos la conexión

    return createdWallet;
  } catch (err) {
    // **Punto Clave 4: Manejo de Errores**
    // Si el error es por "Llave duplicada" (UNIQUE KEY)
    if (err.code === "ER_DUP_ENTRY") {
      throw new Error(`Ya existe una wallet para el usuario ${userId}`);
    }
    // Si es otro error, lo lanzamos
    throw new Error(`Error al crear la wallet: ${err.message}`);
  } finally {
    // **Punto Clave 5: ¡El más importante!**
    // Siempre, siempre, SIEMPRE libera la conexión
    // de vuelta al pool, tanto si falla como si no.
    if (conn) conn.release();
  }
};

/**
 * Función de ayuda para obtener una wallet por su ID.
 * Puede reutilizar una conexión existente si se le pasa una.
 * @param {number} walletId
 * @param {object} [existingConn] - Una conexión opcional
 */
const getWalletById = async (walletId, existingConn = null) => {
  let conn;
  try {
    // Si nos pasaron una conexión, la usamos. Si no, pedimos una nueva.
    conn = existingConn || (await pool.getConnection());

    const sql = "SELECT * FROM Wallets WHERE wallet_id = ?";

    // 'query' devuelve un array de filas.
    // Como buscamos por PK, solo nos interesa la primera (índice 0).
    const rows = await conn.query(sql, [walletId]);

    if (rows.length === 0) {
      throw new Error(`Wallet con id ${walletId} no encontrada.`);
    }

    return rows[0]; // Devuelve el primer (y único) objeto
  } catch (err) {
    throw new Error(`Error al buscar la wallet: ${err.message}`);
  } finally {
    // Solo liberamos la conexión si nosotros la creamos
    if (conn && !existingConn) conn.release();
  }
};

// --- RF2: Consultar Saldo (VERSIÓN SQL) ---

/**
 * Servicio para consultar el saldo por userId (RF2)
 * @param {string} userId - El ID del usuario
 * @returns {object} Un objeto con el saldo y la moneda
 * @throws {Error} Si la wallet no se encuentra
 */
const getBalanceByUserId = async (userId) => {
  // **Punto Clave 1: Conexión**
  let conn;
  try {
    conn = await pool.getConnection();

    // **Punto Clave 2: El Query (SELECT)**
    // Seleccionamos solo los datos que el cliente necesita
    const sql =
      "SELECT wallet_id, user_id, balance, currency, status FROM Wallets WHERE user_id = ?";

    // Ejecutamos el query
    const rows = await conn.query(sql, [userId]);

    // **Punto Clave 3: Manejo de "No Encontrado"**
    if (rows.length === 0) {
      throw new Error(`No se encontró una wallet para el usuario ${userId}`);
    }

    // Devolvemos el primer (y único) resultado
    return rows[0];
  } catch (err) {
    // Relanzamos el error para que el controlador lo atrape
    throw new Error(err.message);
  } finally {
    // **Punto Clave 4: Liberar Conexión**
    if (conn) conn.release();
  }
};

// --- RF3: Crédito (VERSIÓN SQL CON TRANSACCIÓN) ---

/**
 * Servicio para acreditar (sumar) saldo a una wallet
 * @param {number} walletId - El ID de la wallet (PK)
 * @param {number} amount - El monto a acreditar
 * @param {string} externalTransactionId - El ID de la SAGA (RF6)
 * @returns {object} El nuevo estado de la wallet
 */
const credit = async (walletId, amount, externalTransactionId, counterpartyId, currency) => {
  let conn;
  try {
    conn = await pool.getConnection();
    // **Punto Clave 1: Iniciar la Transacción**
    await conn.beginTransaction();

    // **Punto Clave 2: Idempotencia (RF6)**
    // Revisamos si esta TX ya existe *dentro* de la transacción
    const checkSql = "SELECT * FROM Ledger WHERE external_transaction_id = ?";
    const existingTx = await conn.query(checkSql, [externalTransactionId]);

    if (existingTx.length > 0) {
      console.warn(
        `IDEMPOTENCIA: Transacción ${externalTransactionId} ya fue procesada.`
      );
      await conn.rollback(); // Cancelamos la transacción
      return await getWalletById(walletId); // Devolvemos el estado actual
    }

    // **Punto Clave 3: Bloquear la Fila**
    // Obtenemos la wallet y la "bloqueamos" (`FOR UPDATE`).
    // Esto evita que dos créditos al mismo tiempo generen un "race condition".
    const lockSql = "SELECT * FROM Wallets WHERE wallet_id = ? FOR UPDATE";
    const wallets = await conn.query(lockSql, [walletId]);
    if (wallets.length === 0) {
      throw new Error(`Wallet con id ${walletId} no encontrada.`);
    }
    const wallet = wallets[0];

    // Validar Moneda
    if (currency && currency !== wallet.currency) {
      throw new Error(`Moneda incorrecta. La wallet es ${wallet.currency} pero se intentó acreditar ${currency}.`);
    }

    const balanceBefore = parseFloat(wallet.balance);

    // **Punto Clave 4: Ejecutar la Lógica**
    const balanceAfter = balanceBefore + amount;

    // 1. Actualizar la Wallet
    const updateSql = "UPDATE Wallets SET balance = ? WHERE wallet_id = ?";
    await conn.query(updateSql, [balanceAfter, walletId]);

    // 2. Registrar en el Ledger
    const ledgerSql = `
            INSERT INTO Ledger 
            (wallet_id, counterparty_id, external_transaction_id, type, amount, balance_before, balance_after, status) 
            VALUES (?, ?, ?, 'CREDIT', ?, ?, ?, 'COMPLETED')
        `;
    await conn.query(ledgerSql, [
      walletId,
      counterpartyId,
      externalTransactionId,
      amount,
      balanceBefore,
      balanceAfter,
    ]);

    // **Punto Clave 5: ¡Éxito! Guardar todo**
    await conn.commit();

    // Devolvemos la wallet actualizada
    return await getWalletById(walletId, conn); // Reutilizamos la conexión
  } catch (err) {
    // **Punto Clave 6: ¡Fallo! Deshacer todo**
    if (conn) await conn.rollback();

    if (err.message.includes("no encontrada")) {
      throw new Error(err.message);
    }
    throw new Error(`Error en transacción de crédito: ${err.message}`);
  } finally {
    if (conn) conn.release();
  }
};

// --- RF4: Débito (VERSIÓN SQL CON TRANSACCIÓN) ---

/**
 * Servicio para debitar (restar) saldo de una wallet
 * @param {number} walletId - El ID de la wallet (PK)
 * @param {number} amount - El monto a debitar
 * @param {string} externalTransactionId - El ID de la SAGA (RF6)
 * @returns {object} El nuevo estado de la wallet
 */
const debit = async (walletId, amount, externalTransactionId, counterpartyId, currency) => {
  let conn;
  try {
    conn = await pool.getConnection();
    // 1. Iniciar Transacción
    await conn.beginTransaction();

    // 2. Idempotencia
    const checkSql = "SELECT * FROM Ledger WHERE external_transaction_id = ?";
    const existingTx = await conn.query(checkSql, [externalTransactionId]);
    if (existingTx.length > 0) {
      console.warn(
        `IDEMPOTENCIA: Transacción ${externalTransactionId} ya fue procesada.`
      );
      await conn.rollback();
      return await getWalletById(walletId);
    }

    // 3. Bloquear la Fila
    const lockSql = "SELECT * FROM Wallets WHERE wallet_id = ? FOR UPDATE";
    const wallets = await conn.query(lockSql, [walletId]);
    if (wallets.length === 0) {
      throw new Error(`Wallet con id ${walletId} no encontrada.`);
    }
    const wallet = wallets[0];

    // Validar Moneda
    if (currency && currency !== wallet.currency) {
      throw new Error(`Moneda incorrecta. La wallet es ${wallet.currency} pero se intentó debitar ${currency}.`);
    }

    const balanceBefore = parseFloat(wallet.balance);

    // **Punto Clave 4: Regla de Negocio (RF5: Fondos Insuficientes)**
    if (balanceBefore < amount) {
      await conn.rollback(); // Cancelamos la transacción
      const error = new Error("Fondos insuficientes.");
      error.code = "INSUFFICIENT_FUNDS"; // Código de error
      throw error;
    }

    // 5. Ejecutar la Lógica
    const balanceAfter = balanceBefore - amount;

    // 6. Actualizar Wallet
    const updateSql = "UPDATE Wallets SET balance = ? WHERE wallet_id = ?";
    await conn.query(updateSql, [balanceAfter, walletId]);

    // 7. Registrar en Ledger
    const ledgerSql = `
            INSERT INTO Ledger 
            (wallet_id, counterparty_id, external_transaction_id, type, amount, balance_before, balance_after, status) 
            VALUES (?, ?, ?, 'DEBIT', ?, ?, ?, 'COMPLETED')
        `;
    await conn.query(ledgerSql, [
      walletId,
      counterpartyId,
      externalTransactionId,
      amount,
      balanceBefore,
      balanceAfter,
    ]);

    // 8. ¡Éxito! Guardar
    await conn.commit();

    return await getWalletById(walletId, conn);
  } catch (err) {
    if (conn) await conn.rollback();

    // Si es el error que nosotros lanzamos, lo reenviamos
    if (err.code === "INSUFFICIENT_FUNDS") {
      throw err;
    }
    if (err.message.includes("no encontrada")) {
      throw new Error(err.message);
    }
    throw new Error(`Error en transacción de débito: ${err.message}`);
  } finally {
    if (conn) conn.release();
  }
};

// --- RF7: Consultar Ledger (VERSIÓN SQL) ---

/**
 * Servicio para consultar los movimientos del ledger (RF7)
 * @param {number} walletId - El ID de la wallet (PK)
 * @returns {Array} Una lista de los movimientos
 */
const getLedgerByWalletId = async (walletId) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // **Punto Clave 1: Validar que la wallet existe**
    // (Buena práctica antes de hacer la consulta principal)
    await getWalletById(walletId, conn); // Reutilizamos nuestra función de ayuda

    // **Punto Clave 2: El Query (SELECT)**
    // Pedimos todos los movimientos de esa wallet,
    // ordenados por el más reciente primero.
    const sql =
      "SELECT * FROM Ledger WHERE wallet_id = ? ORDER BY created_at DESC";

    const rows = await conn.query(sql, [walletId]);

    return rows; // Devolvemos el array de movimientos
  } catch (err) {
    // Si 'getWalletById' falla, lanzará un error
    throw new Error(err.message);
  } finally {
    if (conn) conn.release();
  }
};

// --- RF10: Compensación (VERSIÓN SQL CON TRANSACCIÓN) ---

/**
 * Servicio para compensar (revertir) una transacción previa (RF10)
 * @param {string} originalExternalTransactionId - El ID de la transacción que falló
 * @param {string} compensationTransactionId - El ID de esta nueva operación de compensación
 * @returns {object} El registro del ledger de la compensación
 */
const compensate = async (
  originalExternalTransactionId,
  compensationTransactionId
) => {
  let conn;
  try {
    conn = await pool.getConnection();
    // 1. Iniciar Transacción
    await conn.beginTransaction();

    // **Punto Clave 1: Idempotencia de la Compensación**
    // ¿Ya ejecutamos *esta* compensación?
    let checkSql = "SELECT * FROM Ledger WHERE external_transaction_id = ?";
    let existingTx = await conn.query(checkSql, [compensationTransactionId]);
    if (existingTx.length > 0) {
      console.warn(
        `IDEMPOTENCIA: Compensación ${compensationTransactionId} ya fue procesada.`
      );
      await conn.rollback();
      return existingTx[0]; // Devolvemos la compensación que ya existía
    }

    // **Punto Clave 2: Encontrar la transacción ORIGINAL**
    checkSql = "SELECT * FROM Ledger WHERE external_transaction_id = ?";
    const originalTxRows = await conn.query(checkSql, [
      originalExternalTransactionId,
    ]);
    if (originalTxRows.length === 0) {
      throw new Error(
        `Transacción original ${originalExternalTransactionId} no encontrada.`
      );
    }
    const originalTx = originalTxRows[0];

    // **Punto Clave 3: Verificar si la original ya fue compensada**
    checkSql =
      'SELECT * FROM Ledger WHERE original_tx_id = ? AND type = "COMPENSATION"';
    const existingCompensation = await conn.query(checkSql, [
      originalExternalTransactionId,
    ]);
    if (existingCompensation.length > 0) {
      throw new Error(
        `Transacción original ${originalExternalTransactionId} ya fue compensada.`
      );
    }

    // **Punto Clave 4: Ejecutar la lógica de reversión (Bloqueando la wallet)**
    const lockSql = "SELECT * FROM Wallets WHERE wallet_id = ? FOR UPDATE";
    const wallets = await conn.query(lockSql, [originalTx.wallet_id]);
    const wallet = wallets[0];
    const balanceBefore = parseFloat(wallet.balance);

    let compensationType = "";
    let balanceAfter = 0;
    const amountToCompensate = parseFloat(originalTx.amount);

    if (originalTx.type === "DEBIT") {
      // La original fue un DÉBITO, compensamos con un CRÉDITO
      compensationType = "CREDIT";
      balanceAfter = balanceBefore + amountToCompensate;
    } else if (originalTx.type === "CREDIT") {
      // La original fue un CRÉDITO, compensamos con un DÉBITO
      compensationType = "DEBIT";

      // **¡Importante!** Debemos aplicar RF5 también a la compensación
      if (balanceBefore < amountToCompensate) {
        await conn.rollback();
        const error = new Error(
          `Fondos insuficientes para compensar TX ${originalExternalTransactionId}`
        );
        error.code = "INSUFFICIENT_FUNDS_FOR_COMPENSATION";
        throw error;
      }
      balanceAfter = balanceBefore - amountToCompensate;
    } else {
      throw new Error(
        "No se puede compensar una transacción de tipo 'COMPENSATION'."
      );
    }

    // 5. Actualizar la Wallet
    const updateSql = "UPDATE Wallets SET balance = ? WHERE wallet_id = ?";
    await conn.query(updateSql, [balanceAfter, wallet.wallet_id]);

    // 6. Registrar la compensación en el Ledger
    const ledgerSql = `
            INSERT INTO Ledger 
            (wallet_id, counterparty_id, external_transaction_id, original_tx_id, type, amount, balance_before, balance_after, status, description) 
            VALUES (?, ?, ?, ?, 'COMPENSATION', ?, ?, ?, 'COMPLETED', ?)
        `;
    const description = `Compensación de ${originalTx.type} (TX: ${originalTx.external_transaction_id})`;
    const insertResult = await conn.query(ledgerSql, [
      wallet.wallet_id,
      originalTx.counterparty_id,
      compensationTransactionId,
      originalExternalTransactionId,
      amountToCompensate,
      balanceBefore,
      balanceAfter,
      description,
    ]);

    // 7. ¡Éxito! Guardar todo
    await conn.commit();

    // 8. Devolver el registro de la compensación creada
    const newLedgerId = Number(insertResult.insertId);
    const newLedgerEntry = (
      await conn.query("SELECT * FROM Ledger WHERE ledger_id = ?", [
        newLedgerId,
      ])
    )[0];

    return newLedgerEntry;
  } catch (err) {
    if (conn) await conn.rollback();
    // Reenviamos el error
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

/**
 * @param {number} walletId 
 */
const getLedgerWithDetails = async (walletId) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Obtener Transacciones (Igual que getLedgerByWalletId)
    const sqlTx = "SELECT * FROM Ledger WHERE wallet_id = ? ORDER BY created_at DESC";
    const transactions = await conn.query(sqlTx, [walletId]);

    if (transactions.length === 0) return [];

    // 2. Extraer IDs de las contrapartes (Wallets)
    // Filtramos nulos y quitamos duplicados
    const counterpartyWalletIds = [...new Set(
      transactions
        .map(tx => tx.counterparty_id)
        .filter(id => id !== null && id !== undefined)
    )];

    // Si todas son operaciones internas (sin contraparte), devolvemos ya
    if (counterpartyWalletIds.length === 0) return transactions;

    // 3. Traducir WalletID -> UserID (Consulta local a tu DB)
    // Truco SQL: Para usar IN (?) con mysql2, pasamos el array directamente
    const sqlWallets = "SELECT wallet_id, user_id FROM Wallets WHERE wallet_id IN (?)";
    const walletsInfo = await conn.query(sqlWallets, [counterpartyWalletIds]);

    // Mapa: WalletID -> UserID
    const walletToUserMap = {};
    const userIdsToFetch = [];

    walletsInfo.forEach(w => {
      walletToUserMap[w.wallet_id] = w.user_id;
      if(w.user_id) userIdsToFetch.push(w.user_id);
    });

    // 4. Llamar al User Service (El paso mágico 🚀)
    let usersData = [];
    try {
        // OJO: Asegúrate que esta URL sea accesible desde Railway
        const response = await axios.post('https://userservicesanti.onrender.com/users/batch-info', { 
            userIds: userIdsToFetch 
        });
        usersData = response.data;
    } catch (error) {
        console.error("Error conectando con User Service:", error.message);
        // No lanzamos error, seguimos para no romper la app, solo saldrán "Desconocidos"
    }

    // Mapa: UserID -> Datos { fullname, phone }
    const userDetailsMap = {};
    usersData.forEach(u => {
        // Ajustamos a la estructura que devuelve tu User Service
        if (u.user && u.user.user_id) {
            userDetailsMap[u.user.user_id] = {
                fullname: u.fullname,
                phone: u.user.phone
            };
        }
    });

    // 5. Mezclar todo (Enrichment)
    const enrichedTransactions = transactions.map(tx => {
        const walletContraparte = tx.counterparty_id;
        const userIdContraparte = walletToUserMap[walletContraparte];
        const detalles = userDetailsMap[userIdContraparte];

        return {
            ...tx, // Copiamos datos originales de la transacción
            // Inyectamos la info extra
            counterparty_details: detalles || { fullname: 'Usuario Externo / Desconocido', phone: '---' }
        };
    });

    return enrichedTransactions;

  } catch (err) {
    throw new Error(`Error en ledger enriquecido: ${err.message}`);
  } finally {
    if (conn) conn.release();
  }
};



// Exportamos las funciones
module.exports = {
  create,
  getBalanceByUserId,
  credit,
  debit,
  getLedgerByWalletId,
  compensate,
  getWalletById,
  getLedgerWithDetails,
};


