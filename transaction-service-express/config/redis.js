// config/redis.js
require('dotenv').config();
const Redis = require('ioredis');

// Cliente de Redis
const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

// Exportamos el cliente
module.exports = redisClient;