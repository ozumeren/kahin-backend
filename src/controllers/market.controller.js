// src/controllers/market.controller.js
const marketService = require('../services/market.service');

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res, next) {
    try {
      // Query parametrelerinden filtreleme al
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }

      const markets = await marketService.findAll(filters);
      res.status(200).json({
        success: true,
        count: markets.length,
        data: markets
      });
    } catch (error) {
      next(error);
    }
  }

  // Tek bir pazarın detayını getir (Public)
  async getMarketById(req, res, next) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);
      res.status(200).json({
        success: true,
        data: market
      });
    } catch (error) {
      next(error);
    }
  }

  // Order book'u getir (Public) - Kalshi/Polymarket standardı
  async getOrderBook(req, res, next) {
    try {
      const { id } = req.params;
      const orderBook = await marketService.getOrderBook(id);
      res.status(200).json({
        success: true,
        data: orderBook
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MarketController();