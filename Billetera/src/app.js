// src/app.js
const express = require("express");
const cors = require("cors")
const app = express();

// --- 1. Middlewares ---

// Esto permite que CUALQUIER frontend hable con tu backend.
app.use(cors());

// **Punto Clave:** Este middleware es vital.
// Le enseña a Express a leer y entender el formato JSON
// que nos enviarán en el 'body' de las peticiones (ej. desde el Transaction Service).
// Sin esto, req.body siempre llegaría vacío.
app.use(express.json());

// --- 2. Rutas ---

// Importamos el "mapa" de las rutas de wallet
const walletRoutes = require("./routes/wallet.routes");

// Le decimos a Express que use ese mapa.
// **Punto Clave:** Todo lo definido en 'walletRoutes'
// ahora tendrá el prefijo '/api/v1/wallets'
// Por ej: '/create' en el router se volverá '/api/v1/wallets/create'
app.use("/api/v1/wallets", walletRoutes);

// --- 3. Ruta de Prueba (Health Check) ---
// Una ruta simple para saber si el servidor está vivo.
app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "¡Pong! El Wallet Service (mock) está vivo y coleando.",
  });
});

// --- 4. Exportación ---
// Exportamos la 'app' para que el server.js la pueda arrancar.
module.exports = app;
