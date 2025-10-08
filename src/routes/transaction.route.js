// src/routes/transaction.route.js
const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

// Kullanıcı route'ları (korumalı)
router.get('/my', authMiddleware, transactionController.getMyTransactions);
router.get('/my/summary', authMiddleware, transactionController.getMySummary);
router.get('/my/market/:marketId', authMiddleware, transactionController.getMyMarketTransactions);

// Admin route'ları
router.get('/system/stats', authMiddleware, adminMiddleware, transactionController.getSystemStats);

module.exports = router;