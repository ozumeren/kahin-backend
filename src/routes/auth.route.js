// src/routes/auth.route.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');

router.post('/register', authController.register);

// --- YENİ LOGIN ROTASI ---
router.post('/login', authController.login);
// -------------------------

module.exports = router;