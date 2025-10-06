// src/controllers/admin.controller.js
const marketService = require('../services/market.service');

class AdminController {
  async resolveMarket(req, res) {
    try {
      const { id } = req.params;
      const { outcome } = req.body;

      if (outcome === null || outcome === undefined) {
        throw new Error('Sonuç (outcome) belirtilmelidir.');
      }

      const result = await marketService.resolveMarket(id, outcome);
      res.status(200).json({ message: 'Pazar başarıyla sonuçlandırıldı.', ...result });
    } catch (error) {
      res.status(400).json({ message: 'Pazar sonuçlandırılırken bir hata oluştu.', error: error.message });
    }
  }
}
module.exports = new AdminController();