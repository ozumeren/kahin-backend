// src/routes/admin.route.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Bu rota korumalıdır. Şimdilik sadece giriş yapmış kullanıcılar erişebilir.
// İleride buraya bir "admin rolü" kontrolü de eklenebilir.
router.post('/markets/:id/resolve', authMiddleware, adminController.resolveMarket);

module.exports = router;