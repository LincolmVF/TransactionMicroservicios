// index.js

// Cargar variables de entorno (¡siempre primero!)
require('dotenv').config();

const express = require('express');
const cors = require('cors');

// --- 1. Configuración del Servidor ---
const app = express();
app.use(cors());
app.use(express.json()); // Middleware para entender JSON

// --- 2. Cargar las Rutas ---
const transactionRoutes = require('./routes/transaction.routes');

// Le decimos a Express que use ese archivo de rutas
// para todas las URLs que empiecen con '/transactions'
app.use('/transactions', transactionRoutes);

// --- 3. Iniciar Servidor ---
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servicio de Transacción (Express) corriendo en http://localhost:${PORT}`);
});

// (Opcional) Ruta de bienvenida para saber que la API está viva
app.get('/', (req, res) => {
  res.send('API de Transacciones está funcionando.');
});