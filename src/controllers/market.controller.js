// src/controllers/market.controller.js
const marketService = require('../services/market.service');

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res) {
    try {
      // Query parametrelerinden filtreleme al
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }

      const markets = await marketService.findAll(filters);
      res.status(200).json(markets);
    } catch (error) {
      res.status(500).json({ 
        message: 'Pazarlar getirilirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Tek bir pazarın detayını getir (Public)
  async getMarketById(req, res) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);
      res.status(200).json(market);
    } catch (error) {
      if (error.message === 'Pazar bulunamadı.') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ 
        message: 'Pazar getirilirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // NOT: createMarket fonksiyonu artık admin.controller.js'te
}

module.exports = new MarketController();