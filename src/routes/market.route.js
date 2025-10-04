// src/routes/market.route.js
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');

// GET /api/v1/markets -> Tüm pazarları listeler
router.get('/', marketController.getMarkets);

// GET /api/v1/markets/:id -> Tek bir pazarın detayını getirir
router.get('/:id', marketController.getMarketById);

module.exports = router;