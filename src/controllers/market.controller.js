// src/controllers/market.controller.js
const marketService = require('../services/market.service');
const db = require('../models');
const { Trade } = db;

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res, next) {
    try {
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }

      const markets = await marketService.findAll(filters);
      
      // Her market için volume ve tradersCount hesapla
      const marketsWithStats = await Promise.all(
        markets.map(async (market) => {
          const marketData = market.toJSON();
          
          // Volume hesapla (tüm trade'lerin toplamı)
          const trades = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['total'],
            raw: true
          });
          
          marketData.volume = trades.reduce((sum, trade) => {
            return sum + parseFloat(trade.total || 0);
          }, 0).toFixed(2);
          
          // Unique trader count hesapla
          const uniqueTraders = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['buyerId', 'sellerId'],
            raw: true
          });
          
          const traderSet = new Set();
          uniqueTraders.forEach(trade => {
            traderSet.add(trade.buyerId);
            traderSet.add(trade.sellerId);
          });
          
          marketData.tradersCount = traderSet.size;
          
          return marketData;
        })
      );

      res.status(200).json({
        success: true,
        count: marketsWithStats.length,
        data: marketsWithStats
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
      const marketData = market.toJSON();
      
      // Volume hesapla
      const trades = await Trade.findAll({
        where: { marketId: id },
        attributes: ['total'],
        raw: true
      });
      
      marketData.volume = trades.reduce((sum, trade) => {
        return sum + parseFloat(trade.total || 0);
      }, 0).toFixed(2);
      
      // Unique trader count hesapla
      const uniqueTraders = await Trade.findAll({
        where: { marketId: id },
        attributes: ['buyerId', 'sellerId'],
        raw: true
      });
      
      const traderSet = new Set();
      uniqueTraders.forEach(trade => {
        traderSet.add(trade.buyerId);
        traderSet.add(trade.sellerId);
      });
      
      marketData.tradersCount = traderSet.size;
      
      res.status(200).json({
        success: true,
        data: marketData
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