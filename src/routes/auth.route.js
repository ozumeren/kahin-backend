// src/routes/auth.route.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Sadece register rotası
router.post('/register', authController.register);

// Diğer rotaları (login vb.) daha sonra ekleyeceğiz
// router.post('/login', authController.login);

module.exports = router;