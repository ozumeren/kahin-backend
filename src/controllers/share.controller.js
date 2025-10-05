// src/controllers/share.controller.js
const shareService = require('../services/share.service');

class ShareController {
  async purchaseShares(req, res) {
    try {
      const { marketId, outcome, quantity } = req.body;
      const userId = req.user.id; // Bu bilgi authMiddleware'den geliyor

      const result = await shareService.purchase(userId, marketId, outcome, quantity);
      res.status(201).json({ message: 'Hisse alımı başarılı!', ...result });
    } catch (error) {
      res.status(400).json({ message: 'Hisse alımı sırasında hata oluştu.', error: error.message });
    }
  }
}
module.exports = new ShareController();