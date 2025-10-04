// src/controllers/market.controller.js
const marketService = require('../services/market.service');

class MarketController {
  async getMarkets(req, res) {
    try {
      // Şimdilik tüm pazarları getiriyoruz.
      const markets = await marketService.findAll();
      res.status(200).json(markets);
    } catch (error) {
      res.status(500).json({ message: 'Pazarlar getirilirken bir hata oluştu.', error: error.message });
    }
  }

  async getMarketById(req, res) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);
      res.status(200).json(market);
    } catch (error) {
      if (error.message === 'Pazar bulunamadı.') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Pazar getirilirken bir hata oluştu.', error: error.message });
    }
  }
}

module.exports = new MarketController();