// src/routes/admin.route.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const marketAutomation = require('../services/market.automation.service');

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

// Manuel market kapama
router.post('/markets/:marketId/close', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const { result } = req.body; // true/false/null
    
    const closeResult = await marketAutomation.manualCloseMarket(
      marketId, 
      req.user.id, 
      result
    );
    
    res.status(200).json({
      success: true,
      message: 'Market başarıyla kapatıldı',
      data: closeResult
    });
  } catch (error) {
    next(error);
  }
});

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