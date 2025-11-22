// src/config/db.js
const mariadb = require("mariadb");
require("dotenv").config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, // <-- Usamos el nombre de tu .env
  connectionLimit: 5,
  allowPublicKeyRetrieval: true,
  bigIntAsNumber: true, // Solo usará number
});

/**
 * SQL para crear las tablas del Wallet Service
 * Usamos 'CREATE TABLE IF NOT EXISTS' para que solo se ejecute
 * la primera vez, sin dar error si ya existen.
 */
const WALLET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Wallets (
    wallet_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'SOL',
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Esta es la forma correcta de asegurar una wallet por usuario
    -- ¡Sin Foreign Key!
    UNIQUE KEY uq_user_id (user_id) 
) ENGINE=InnoDB;
`;

const WALLET_LIMITS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Wallet_Limits (
    limit_id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL UNIQUE,
    daily_limit DECIMAL(15, 2) DEFAULT 1000.00,
    used_today DECIMAL(15, 2) DEFAULT 0.00,

    -- Esta SÍ es una Foreign Key, porque AMBAS tablas
    -- ('Wallets' y 'Wallet_Limits') te pertenecen a TI.
    FOREIGN KEY (wallet_id) REFERENCES Wallets(wallet_id)
) ENGINE=InnoDB;
`;

// Esta es tu tabla Ledger (RF6), ajustada para SAGA
const LEDGER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Ledger (
    ledger_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    counterparty_id VARCHAR(255) NULL,
    
    -- Este es tu 'externalTransactionId' que usamos en los mocks.
    -- Es un 'ID fantasma' del Transaction Service.
    -- Lo hacemos ÚNICO para la idempotencia.
    external_transaction_id VARCHAR(255) NOT NULL UNIQUE,

    -- (Opcional) Guardamos el ID de la TX original que estamos compensando (RF10)
    original_tx_id VARCHAR(255) NULL, 

    type ENUM('CREDIT', 'DEBIT', 'COMPENSATION') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    description VARCHAR(255),
    status ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Esta también es una Foreign Key válida
    FOREIGN KEY (wallet_id) REFERENCES Wallets(wallet_id),

    -- Un INDEX hace que las consultas (SELECT) sobre esa columna sean miles de veces más rápidas.
    INDEX idx_wallet_id (wallet_id)
) ENGINE=InnoDB;
`;

/**
 * Función para crear la DB (si no existe)
 */
async function setupDatabase() {
  let conn;
  try {
    conn = await mariadb.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      allowPublicKeyRetrieval: true,
    });
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_DATABASE}\``
    );
    console.log(`Base de datos '${process.env.DB_DATABASE}' asegurada.`);
  } catch (err) {
    console.error("Error al configurar la base de datos:", err);
    process.exit(1);
  } finally {
    if (conn) conn.end();
  }
}

/**
 * Función para crear las TABLAS (si no existen)
 */
async function setupTables() {
  let conn;
  try {
    // Ahora nos conectamos al pool (que ya apunta a la DB correcta)
    conn = await pool.getConnection();
    console.log("Conexión exitosa a MariaDB. Creando tablas...");

    // Ejecutamos los CREATE TABLE
    await conn.query(WALLET_TABLE_SQL);
    console.log("Tabla 'Wallets' asegurada.");

    await conn.query(WALLET_LIMITS_TABLE_SQL);
    console.log("Tabla 'Wallet_Limits' asegurada.");

    await conn.query(LEDGER_TABLE_SQL);
    console.log("Tabla 'Ledger' asegurada.");

    console.log("¡Todas las tablas están listas!");
  } catch (err) {
    console.error("Error al crear las tablas:", err);
    process.exit(1);
  } finally {
    if (conn) conn.release(); // Soltamos la conexión de vuelta al pool
  }
}

module.exports = {
  pool,
  setupDatabase,
  setupTables,
};
