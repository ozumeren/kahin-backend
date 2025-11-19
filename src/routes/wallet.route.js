// src/routes/wallet.route.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// ========== PROTECTED ROUTES (Auth Gerekli) ==========

// GET /api/v1/wallet/balance - Bakiye sorgulama (with stats)
router.get('/balance', authMiddleware, walletController.getBalance);

// GET /api/v1/wallet/limits - Günlük limitleri göster
router.get('/limits', authMiddleware, walletController.getLimits);

// GET /api/v1/wallet/locked-funds - Kilitli bakiyeyi göster
router.get('/locked-funds', authMiddleware, walletController.getLockedFunds);

// GET /api/v1/wallet/history - Wallet işlem geçmişi
// Query params: ?type=deposit,withdrawal&startDate=&endDate=&limit=20&offset=0&marketId=
router.get('/history', authMiddleware, walletController.getHistory);

// POST /api/v1/wallet/deposit - Para yatırma (test/demo)
router.post('/deposit', authMiddleware, walletController.deposit);

// POST /api/v1/wallet/withdraw - Para çekme
router.post('/withdraw', authMiddleware, walletController.withdraw);

module.exports = router;
