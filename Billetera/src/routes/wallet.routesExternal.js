const express = require("express");
const router = express.Router();

// Importamos nuestro nuevo controlador
const walletController = require("../controllers/wallet.controller");

const { checkExternal } = require('../middleware/auth.middleware');

router.post("/credit-external", checkExternal, walletController.creditWallet);

router.post("/debit-external", checkExternal, walletController.debitWallet);