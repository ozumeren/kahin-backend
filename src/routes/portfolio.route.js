// src/routes/portfolio.route.js
const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Tüm portfolio route'ları korumalı
router.get('/', authMiddleware, portfolioController.getMyPortfolio);
router.get('/realized', authMiddleware, portfolioController.getMyRealizedPnL);
router.get('/performance', authMiddleware, portfolioController.getMyPerformance);
router.get('/market/:marketId', authMiddleware, portfolioController.getMyMarketPosition);

module.exports = router;