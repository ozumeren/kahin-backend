// src/services/market.service.js
const Market = require('../models/market.model');

class MarketService {
  // Tüm pazarları (veya filtrelenmiş olanları) bulur
  async findAll(queryOptions = {}) {
    // İleride filtreleme için (örn: sadece 'open' olanları getir)
    const markets = await Market.findAll({ where: queryOptions });
    return markets;
  }

  // Tek bir pazarı ID'sine göre bulur
  async findById(marketId) {
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw new Error('Pazar bulunamadı.');
    }
    return market;
  }
}

module.exports = new MarketService();