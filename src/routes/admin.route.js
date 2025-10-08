// src/routes/admin.route.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

// Pazar sonuçlandırma (resolve)
router.post('/markets/:id/resolve', 
  authMiddleware, 
  adminMiddleware, 
  adminController.resolveMarket
);

// Pazar kapatma (close) - Yeni eklenen
router.post('/markets/:id/close',
  authMiddleware,
  adminMiddleware,
  adminController.closeMarket
);

// Pazar oluşturma - Sadece adminler oluşturabilsin
router.post('/markets',
  authMiddleware,
  adminMiddleware,
  adminController.createMarket
);

// Kullanıcıya admin yetkisi verme - Süper admin özelliği
router.patch('/users/:id/promote',
  authMiddleware,
  adminMiddleware,
  adminController.promoteToAdmin
);

module.exports = router;