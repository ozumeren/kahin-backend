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