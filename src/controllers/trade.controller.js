// src/controllers/trade.controller.js
const tradeService = require('../services/trade.service');

class TradeController {
  // Kullanıcının kendi trade'leri
  async getMyTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const filters = {
        marketId: req.query.marketId,
        outcome: req.query.outcome === 'true' ? true : req.query.outcome === 'false' ? false : undefined,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await tradeService.getUserTrades(userId, filters);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Kullanıcının belirli market'taki trade'leri
  async getMyMarketTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { marketId } = req.params;

      const result = await tradeService.getUserMarketTrades(userId, marketId);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Kullanıcının trade özeti
  async getMyTradeSummary(req, res, next) {
    try {
      const userId = req.user.id;
      const summary = await tradeService.getUserTradeSummary(userId);
      
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  // Market'taki tüm trade'ler (public)
  async getMarketTrades(req, res, next) {
    try {
      const { marketId } = req.params;
      const filters = {
        outcome: req.query.outcome === 'true' ? true : req.query.outcome === 'false' ? false : undefined,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await tradeService.getMarketTrades(marketId, filters);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Son işlemler (public - real-time feed)
  async getRecentTrades(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const marketId = req.query.marketId;

      const trades = await tradeService.getRecentTrades(limit, marketId);
      
      res.status(200).json({
        success: true,
        data: trades
      });
    } catch (error) {
      next(error);
    }
  }

  // Belirli bir trade detayı
  async getTradeById(req, res, next) {
    try {
      const { id } = req.params;
      const trade = await tradeService.getTradeById(id);
      
      res.status(200).json({
        success: true,
        data: trade
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TradeController();