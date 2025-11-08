// config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool de conexiones a MariaDB
const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Exportamos el pool para que lo usen otros archivos
module.exports = dbPool;