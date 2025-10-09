// src/routes/trade.route.js
const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Public Routes (herkes görebilir)
// GET /api/v1/trades/recent - Son işlemler
router.get('/recent', tradeController.getRecentTrades);

// GET /api/v1/trades/market/:marketId - Belirli market'ın tüm trade'leri
router.get('/market/:marketId', tradeController.getMarketTrades);

// GET /api/v1/trades/:id - Belirli bir trade'in detayı
router.get('/:id', tradeController.getTradeById);

// Protected Routes (sadece giriş yapmış kullanıcılar)
// GET /api/v1/trades/my - Kullanıcının tüm trade'leri
router.get('/my/all', authMiddleware, tradeController.getMyTrades);

// GET /api/v1/trades/my/summary - Kullanıcının trade özeti
router.get('/my/summary', authMiddleware, tradeController.getMyTradeSummary);

// GET /api/v1/trades/my/market/:marketId - Kullanıcının belirli market'taki trade'leri
router.get('/my/market/:marketId', authMiddleware, tradeController.getMyMarketTrades);

module.exports = router;