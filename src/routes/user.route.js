// src/routes/user.route.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// ========== PROTECTED ROUTES (Auth Gerekli) ==========

// GET /api/v1/users/me - Mevcut kullanıcının profili
router.get('/me', authMiddleware, userController.getMe);

// PUT /api/v1/users/me - Profil güncelleme
router.put('/me', authMiddleware, userController.updateMe);

// GET /api/v1/users/me/stats - Kullanıcı istatistikleri
router.get('/me/stats', authMiddleware, userController.getMyStats);

// ========== PUBLIC ROUTES ==========

// GET /api/v1/users/leaderboard - Leaderboard
// Query params: ?limit=20&timeframe=all|week|month
router.get('/leaderboard', userController.getLeaderboard);

// GET /api/v1/users/:id/public - Public profil
router.get('/:id/public', userController.getPublicProfile);

module.exports = router;