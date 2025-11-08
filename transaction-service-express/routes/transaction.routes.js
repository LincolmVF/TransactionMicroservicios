// routes/transaction.routes.js
const express = require('express');
const router = express.Router();

// 1. Importamos el controlador
const controller = require('../controllers/transaction.controller');

// 2. Definimos las rutas
// Nota: '/' aquí significa '/transactions' porque lo definiremos en index.js

// POST /transactions
router.post('/', controller.createTransaction);

// GET /transactions
router.get('/', controller.findAllTransactions);

// GET /transactions/:id
router.get('/:id', controller.findOneTransaction);

// POST /transactions/:id/reverse
router.post('/:id/reverse', controller.reverseTransaction);

// 3. Exportamos el router
module.exports = router;