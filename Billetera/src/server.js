// src/server.js
require("dotenv").config();
const app = require("./app");

// Importamos las 3 cosas
const { pool, setupDatabase, setupTables } = require("./config/db");

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // 1. Aseguramos que la base de datos exista
    await setupDatabase();

    // 2. Aseguramos que las tablas existan
    await setupTables();

    // 3. Probamos la conexión general del pool
    const conn = await pool.getConnection();
    conn.release();
    console.log(`Pool de MariaDB conectado y tablas listas.`);

    // 4. Arrancamos el servidor web
    app.listen(PORT, () => {
      console.log(
        `🚀 Wallet Service (con MariaDB) corriendo en http://localhost:${PORT}`
      );
    });
  } catch (err) {
    console.error("Error al iniciar el servidor:", err);
    process.exit(1);
  }
}

startServer();
