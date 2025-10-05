// src/routes/share.route.js
const express = require('express');
const router = express.Router();
const shareController = require('../controllers/share.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Bu rota korumalıdır. Sadece giriş yapmış kullanıcılar bahis yapabilir.
router.post('/buy', authMiddleware, shareController.purchaseShares);

module.exports = router;