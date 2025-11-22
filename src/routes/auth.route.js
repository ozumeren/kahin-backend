// src/routes/auth.route.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  loginRateLimiter,
  registerRateLimiter,
  authRateLimiter
} = require('../middlewares/rateLimit.middleware');

// Public routes (with rate limiting)
router.post('/login', loginRateLimiter, authController.login.bind(authController));
router.post('/register', registerRateLimiter, authController.register.bind(authController));
router.post('/refresh', authRateLimiter, authController.refresh.bind(authController));

// Protected routes (require authentication)
router.post('/logout', authMiddleware, authController.logout.bind(authController));
router.post('/logout-all', authMiddleware, authController.logoutAll.bind(authController));
router.get('/sessions', authMiddleware, authController.getSessions.bind(authController));
router.delete('/sessions/:sessionId', authMiddleware, authController.revokeSession.bind(authController));
router.get('/me', authMiddleware, authController.me.bind(authController));

module.exports = router;
