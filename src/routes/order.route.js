// src/routes/order.route.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Bu rota korumalıdır. Sadece giriş yapmış kullanıcılar emir verebilir.
router.post('/', authMiddleware, orderController.createOrder);

module.exports = router;