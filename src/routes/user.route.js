// src/routes/user.route.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware'); // <-- GÖREVLİYİ İÇERİ ALDIK
const userController = require('../controllers/user.controller');

// Bu rotaya erişmeden önce authMiddleware çalışacak
router.get('/me', authMiddleware, userController.getMe);

module.exports = router;