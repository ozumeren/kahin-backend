// src/routes/order.route.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// POST /api/v1/orders - Yeni emir oluştur (korumalı)
// Supports: order_type (LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT, STOP_LIMIT)
// time_in_force (GTC, GTD, IOC, FOK), expires_at, trigger_price
router.post('/', authMiddleware, orderController.createOrder);

// GET /api/v1/orders - Kullanıcının emirlerini listele (korumalı)
// Query params: ?status=OPEN&marketId=xxx&type=BUY
router.get('/', authMiddleware, orderController.getMyOrders);

// GET /api/v1/orders/conditional - Koşullu emirleri listele (stop-loss, take-profit)
// Query params: ?marketId=xxx
router.get('/conditional', authMiddleware, orderController.getConditionalOrders);

// POST /api/v1/orders/batch - Birden fazla emir oluştur (korumalı)
router.post('/batch', authMiddleware, orderController.createBatchOrders);

// DELETE /api/v1/orders/batch - Birden fazla emri iptal et (korumalı)
router.delete('/batch', authMiddleware, orderController.cancelBatchOrders);

// GET /api/v1/orders/:id - Tek bir emrin detaylarını getir (korumalı)
router.get('/:id', authMiddleware, orderController.getOrderById);

// PATCH /api/v1/orders/:id - Emri güncelle (fiyat/miktar) (korumalı)
router.patch('/:id', authMiddleware, orderController.amendOrder);

// DELETE /api/v1/orders/:id - Emri iptal et (korumalı)
router.delete('/:id', authMiddleware, orderController.cancelOrder);

module.exports = router;