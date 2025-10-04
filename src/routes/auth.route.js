// src/routes/auth.route.js
const express = require('express');
const router = express.Router();

// Artık gerçek controller'ı kullanıyoruz
const authController = require('../controllers/auth.controller');

// POST /api/v1/auth/register isteği geldiğinde authController'daki register fonksiyonunu çalıştır
router.post('/register', authController.register);

module.exports = router;