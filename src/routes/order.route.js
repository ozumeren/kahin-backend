// src/routes/order.route.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// POST /api/v1/orders - Yeni emir oluştur (korumalı)
router.post('/', authMiddleware, orderController.createOrder);

// GET /api/v1/orders - Kullanıcının emirlerini listele (korumalı)
// Query params: ?status=OPEN&marketId=xxx&type=BUY
router.get('/', authMiddleware, orderController.getMyOrders);

// DELETE /api/v1/orders/:id - Emri iptal et (korumalı)
router.delete('/:id', authMiddleware, orderController.cancelOrder);

module.exports = router;