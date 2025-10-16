// src/routes/option.route.js
const express = require('express');
const router = express.Router();
const optionController = require('../controllers/option.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// POST /api/v1/options/:optionId/trade - Option için alım/satım
router.post('/:optionId/trade', authMiddleware, optionController.tradeOption);

// GET /api/v1/options/market/:marketId/positions - Kullanıcının bir marketteki tüm option pozisyonları
router.get('/market/:marketId/positions', authMiddleware, optionController.getMyMarketOptionPositions);

// GET /api/v1/options/:optionId/positions - Bir option'daki tüm pozisyonlar (public)
router.get('/:optionId/positions', optionController.getOptionPositions);

module.exports = router; // ← Bu satır çok önemli!