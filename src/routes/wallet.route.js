// src/routes/wallet.route.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// ========== PROTECTED ROUTES (Auth Gerekli) ==========

// GET /api/v1/wallet/balance - Bakiye sorgulama
router.get('/balance', authMiddleware, walletController.getBalance);

// POST /api/v1/wallet/deposit - Para yatırma (test/demo)
router.post('/deposit', authMiddleware, walletController.deposit);

// POST /api/v1/wallet/withdraw - Para çekme
router.post('/withdraw', authMiddleware, walletController.withdraw);

// GET /api/v1/wallet/history - Wallet işlem geçmişi
// Query params: ?type=deposit|withdrawal&startDate=&endDate=&limit=50&offset=0
router.get('/history', authMiddleware, walletController.getHistory);

module.exports = router;
