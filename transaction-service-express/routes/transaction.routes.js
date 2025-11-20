// routes/transaction.routes.js
const express = require('express');
const router = express.Router();

// 1. Importamos el controlador
const controller = require('../controllers/transaction.controller');

// 2. Importamos el Middleware de Autenticación (NUEVO)
const authMiddleware = require('../middleware/authMiddleware');

// 3. Definimos las rutas
// Nota: '/' aquí significa '/transactions' porque lo definiremos en index.js

// POST /transactions - Crear transacción (Protegida)
// El flujo es: Petición -> authMiddleware (¿Token OK?) -> createTransaction
router.post('/', authMiddleware, controller.createTransaction);

// GET /transactions - Ver todas (Protegida)
router.get('/', authMiddleware, controller.findAllTransactions);

// GET /transactions/:id - Ver una (Protegida)
router.get('/:id', authMiddleware, controller.findOneTransaction);

// POST /transactions/:id/reverse - Revertir (Protegida)
router.post('/:id/reverse', authMiddleware, controller.reverseTransaction);

// 4. Exportamos el router
module.exports = router;