// src/controllers/market.controller.js
const marketService = require('../services/market.service');
const db = require('../models');
const { Trade, MarketOption } = db;

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res, next) {
    try {
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }
      if (req.query.category) {
        filters.category = req.query.category;
      }

      const markets = await marketService.findAll(filters);
      
      // Her market için volume, tradersCount ve prices hesapla
      const marketsWithStats = await Promise.all(
        markets.map(async (market) => {
          const marketData = market.toJSON();
          
          // Market options'ı dahil et
          const options = await MarketOption.findAll({
            where: { market_id: market.id },
            order: [['option_order', 'ASC']],
            raw: true
          });
          
          marketData.options = options || [];
          
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
          
          // Order book'tan fiyatları al (sadece binary marketler için)
          if (market.market_type === 'binary') {
            try {
              const orderBook = await marketService.getOrderBook(market.id);
              marketData.yesMidPrice = orderBook.yesMidPrice || '0.50';
              marketData.noMidPrice = orderBook.noMidPrice || '0.50';
            } catch (error) {
              marketData.yesMidPrice = '0.50';
              marketData.noMidPrice = '0.50';
            }
          }
          
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

  // Tek bir pazarın detayını getir
  async getMarketById(req, res, next) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);

      if (!market) {
        return res.status(404).json({
          success: false,
          message: 'Pazar bulunamadı'
        });
      }

      const marketData = market.toJSON();

      // Options'ları dahil et
      const options = await MarketOption.findAll({
        where: { market_id: id },
        order: [['option_order', 'ASC']],
        raw: true
      });
      
      marketData.options = options || [];

      // Volume hesapla
      const trades = await Trade.findAll({
        where: { marketId: id },
        attributes: ['total'],
        raw: true
      });
      
      marketData.volume = trades.reduce((sum, trade) => {
        return sum + parseFloat(trade.total || 0);
      }, 0).toFixed(2);

      // Binary market için order book
      if (market.market_type === 'binary') {
        try {
          const orderBook = await marketService.getOrderBook(id);
          marketData.orderBook = orderBook;
        } catch (error) {
          marketData.orderBook = null;
        }
      }

      res.status(200).json({
        success: true,
        data: marketData
      });
    } catch (error) {
      next(error);
    }
  }

  // Order book'u getir
  async getOrderBook(req, res, next) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);

      if (!market) {
        return res.status(404).json({
          success: false,
          message: 'Pazar bulunamadı'
        });
      }

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