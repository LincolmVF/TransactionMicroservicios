// src/controllers/wallet.controller.js

// Importamos el "cerebro" (la lógica de negocio)
const walletService = require("../services/wallet.service");

/**
 * Controlador para crear una nueva wallet
 * Maneja el request (req) y el response (res) de HTTP
 */
const createWallet = async (req, res) => {

  // // El payload del token está en req.user
  // const { role } = req.user;

  // // Solo permitimos que el "Transaction Service" nos debite
  // // (Auth Service le da el rol 'service')
  // if (role !== 'service') {
  //   return res.status(403).json({ error: 'Prohibido: No tienes permisos de servicio' });
  // }

  // **Punto Clave 1: Obtener datos del Request**
  // Sacamos el 'userId' que nos enviaron en el body JSON
  const { userId } = req.body;

  // Validación de entrada simple
  if (!userId) {
    return res.status(400).json({
      error: "El campo 'userId' es obligatorio.",
    });
  }

  try {
    // **Punto Clave:** Añadimos 'await'
    // para esperar a que la base de datos responda
    const newWallet = await walletService.create(userId);

    // **Punto Clave 3: Enviar Respuesta Exitosa**
    // Si todo sale bien, respondemos 201 (Created)
    res.status(201).json(newWallet);
  } catch (error) {
    // El manejo de errores sigue igual, ¡pero ahora funciona
    // con los errores de la base de datos!
    if (error.message.includes("Ya existe")) {
      return res.status(409).json({ error: error.message }); // 409 Conflict
    }
    res.status(500).json({ error: error.message }); // Error general del servidor
  }
};

/**
 * Controlador para obtener el saldo de una wallet
 */
const getWalletBalance = async (req, res) => {
  // **Punto Clave 1: Obtener datos del Request**
  // El ID que el usuario pide en la URL
  const { userId: userIdFromParams } = req.params;

  // Los datos que vienen DENTRO del token
  const { userId: userIdFromToken, role } = req.user;

  // Un usuario solo puede ver su propio saldo.
  if (role === 'user' && userIdFromParams !== userIdFromToken) {
    return res.status(403).json({ error: 'Prohibido: No puedes ver el saldo de otro usuario' });
  }

  try {
    // **Punto Clave 2: Llamar al Servicio**
    const balanceData = await walletService.getBalanceByUserId(userIdFromParams);

    // **Punto Clave 3: Enviar Respuesta Exitosa**
    res.status(200).json(balanceData);
  } catch (error) {
    // **Punto Clave:** Manejar error 404
    // Si el servicio lanza el error "No se encontró"
    if (error.message.includes("No se encontró")) {
      return res.status(404).json({ error: error.message }); // 404 Not Found
    }
    res.status(500).json({ error: error.message }); // Error general
  }
};

const getWalletDetails = async (req, res) => {
  const { walletId } = req.params;
  const idAsNumber = parseInt(walletId, 10);

  if (isNaN(idAsNumber)) {
    return res.status(400).json({ error: "El walletId debe ser numérico." });
  }

  try {
    // Llamamos al servicio que ya tienes creado
    const wallet = await walletService.getWalletById(idAsNumber);

    // Devolvemos la wallet completa (incluye user_id)
    res.status(200).json(wallet);

  } catch (error) {
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// --- (Controlador de Crédito) ---
const creditWallet = async (req, res) => {

  // // El payload del token está en req.user
  // const { role } = req.user;

  // // Solo permitimos que el "Transaction Service" nos debite
  // // (Auth Service le da el rol 'service')
  // if (role !== 'service') {
  //   return res.status(403).json({ error: 'Prohibido: No tienes permisos de servicio' });
  // }

  // **Punto Clave 1: Obtener datos del Request**
  // El Transaction Service nos enviará esto en el body (RF8)
  const { walletId, amount, externalTransactionId, counterpartyId, currency } = req.body;

  // Convertimos a número para asegurar
  const numericAmount = parseFloat(amount);
  const numericWalletId = parseInt(walletId, 10);

  if (
    !numericWalletId ||
    !numericAmount ||
    !externalTransactionId ||
    !counterpartyId ||
    numericAmount <= 0
  ) {
    return res.status(400).json({
      error:
        "Datos inválidos: walletId (número), counterpartyId, amount (número > 0) y externalTransactionId son obligatorios.",
    });
  }

  try {
    // **Punto Clave:** Añadimos 'await'
    const updatedWallet = await walletService.credit(
      numericWalletId,
      numericAmount,
      externalTransactionId,
      counterpartyId,
      currency
    );
    res.status(200).json(updatedWallet);
  } catch (error) {
    if (error.message.includes("no encontrada")) {
      return res.status(404).json({ error: error.message }); // 404 Not Found
    }
    res.status(500).json({ error: error.message }); // Error general
  }
};

// --- (Controlador de Débito) ---
const debitWallet = async (req, res) => {

  // // El payload del token está en req.user
  // const { role } = req.user;

  // // Solo permitimos que el "Transaction Service" nos debite
  // // (Auth Service le da el rol 'service')
  // if (role !== 'service') {
  //   return res.status(403).json({ error: 'Prohibido: No tienes permisos de servicio' });
  // }

  const { walletId, amount, externalTransactionId, counterpartyId, currency } = req.body;

  const numericAmount = parseFloat(amount);
  const numericWalletId = parseInt(walletId, 10);

  if (
    !numericWalletId ||
    !numericAmount ||
    !externalTransactionId ||
    !counterpartyId ||
    numericAmount <= 0
  ) {
    return res.status(400).json({
      error:
        "Datos inválidos: walletId (número), counterpartyId, amount (número > 0) y externalTransactionId son obligatorios.",
    });
  }

  try {
    // **Punto Clave:** Añadimos 'await'
    const updatedWallet = await walletService.debit(
      numericWalletId,
      numericAmount,
      externalTransactionId,
      counterpartyId,
      currency
    );
    res.status(200).json(updatedWallet);
  } catch (error) {
    // **Punto Clave:** Manejar error de RF5
    if (error.code === "INSUFFICIENT_FUNDS") {
      return res.status(409).json({ error: error.message }); // 409 Conflict
    }
    if (error.message.includes("no encontrada")) {
      return res.status(404).json({ error: error.message }); // 404 Not Found
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para obtener los movimientos del ledger (RF7)
 */
const getWalletLedger = async (req, res) => {
  // **Punto Clave 1: Obtener datos del Request**
  // El ID viene de la URL (parámetros)
  // Lo convertimos a número porque en el mock lo usamos como número
  const { walletId } = req.params;
  const idAsNumber = parseInt(walletId, 10);

  // Obtenemos los datos del Token
  const { userId: userIdFromToken, role } = req.user;

  if (isNaN(idAsNumber)) {
    return res.status(400).json({ error: "El walletId debe ser numérico." });
  }

  try {

    // Verificamos: ¿Es un usuario normal?
    if (role === 'user') {
      // Si es 'user', DEBEMOS verificar que sea el dueño.

      // Obtenemos la billetera para ver quién es el dueño
      // (Reutilizamos la función de ayuda que ya teníamos)
      const wallet = await walletService.getWalletById(idAsNumber);

      // Comparamos el dueño de la wallet con el dueño del token
      if (wallet.user_id !== userIdFromToken) {
        return res.status(403).json({ error: 'Prohibido: No tienes permiso para ver este ledger.' });
      }
    }

    // **Punto Clave:** Añadimos 'await'
    const movements = await walletService.getLedgerByWalletId(idAsNumber);
    res.status(200).json(movements);
  } catch (error) {
    if (error.message.includes("no encontrada")) {
      return res.status(404).json({ error: error.message }); // 404 Not Found
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * Controlador para compensar una transacción (RF10)
 */
const compensateWallet = async (req, res) => {

  // // El payload del token está en req.user
  // const { role } = req.user;

  // // Solo permitimos que el "Transaction Service" nos debite
  // // (Auth Service le da el rol 'service')
  // if (role !== 'service') {
  //   return res.status(403).json({ error: 'Prohibido: No tienes permisos de servicio' });
  // }

  // **Punto Clave 1: Obtener datos del Request**
  // El TS nos envía el ID de la TX original y el ID de esta nueva TX de compensación
  const { originalExternalTransactionId, compensationTransactionId } = req.body;

  if (!originalExternalTransactionId || !compensationTransactionId) {
    return res.status(400).json({
      error:
        "Faltan campos obligatorios: originalExternalTransactionId, compensationTransactionId",
    });
  }

  try {
    // **Punto Clave 2: Llamar al Servicio**
    const compensationLedger = await walletService.compensate(
      originalExternalTransactionId,
      compensationTransactionId
    );

    // Respondemos 200 OK con el ticket de la compensación
    res.status(200).json(compensationLedger);
  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS_FOR_COMPENSATION") {
      return res.status(409).json({ error: error.message }); // 409 Conflict
    }
    if (
      error.message.includes("no encontrada") ||
      error.message.includes("ya fue compensada")
    ) {
      // 404 (No encontrada) o 409 (Conflicto, ya compensada)
      return res.status(409).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: `Error crítico en compensación: ${error.message}` });
  }
};

module.exports = {
  createWallet,
  getWalletBalance,
  creditWallet,
  debitWallet,
  getWalletLedger,
  compensateWallet,
  getWalletDetails
};
