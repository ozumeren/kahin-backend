// src/routes/admin.route.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const marketAutomation = require('../services/market.automation.service');

// ✨ YENİ - Pazar güncelleme
router.put('/markets/:id', 
  authMiddleware, 
  adminMiddleware, 
  adminController.updateMarket
);

// ✨ YENİ - Pazar silme
router.delete('/markets/:id', 
  authMiddleware, 
  adminMiddleware, 
  adminController.deleteMarket
);

// Pazar sonuçlandırma (resolve)
router.post('/markets/:id/resolve', 
  authMiddleware, 
  adminMiddleware, 
  adminController.resolveMarket
);

// Pazar kapatma (close)
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

// Kullanıcıya para ekleme
router.post('/users/:id/add-balance',
  authMiddleware,
  adminMiddleware,
  adminController.addBalanceToUser
);

// Tüm kullanıcıları listeleme
router.get('/users',
  authMiddleware,
  adminMiddleware,
  adminController.getAllUsers
);

// Tüm pazarları listeleme (admin view)
router.get('/markets',
  authMiddleware,
  adminMiddleware,
  adminController.getAllMarkets
);

// Kullanıcıya hisse ekleme
router.post('/users/:id/add-shares',
  authMiddleware,
  adminMiddleware,
  adminController.addSharesToUser
);

module.exports = router;