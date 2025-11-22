const express = require("express");
const router = express.Router();

// 1. Importamos el Controlador
const externalController = require("../controllers/external.controller");

// 2. Importamos el Middleware de Seguridad (El "Candado")
const b2bAuthMiddleware = require("../middleware/b2bAuth.middleware");

// 3. Definimos la ruta PROTEGIDA
// La ruta final será: POST /api/external/receive
router.post(
    "/receive", 
    b2bAuthMiddleware, // <--- ¡AQUÍ ESTÁ LA PROTECCIÓN! Primero pasa por aquí.
    externalController.receiveExternalTransfer // Si tiene la llave correcta, pasa al controlador.
);

module.exports = router;