// src/controllers/portfolio.controller.js
const portfolioService = require('../services/portfolio.service');

class PortfolioController {
  // Tam portföy analizi
  async getMyPortfolio(req, res, next) {
    try {
      const userId = req.user.id;
      const portfolio = await portfolioService.getPortfolio(userId);
      
      res.status(200).json({
        success: true,
        data: portfolio
      });
    } catch (error) {
      next(error);
    }
  }

  // Gerçekleşmiş kar/zarar
  async getMyRealizedPnL(req, res, next) {
    try {
      const userId = req.user.id;
      const realized = await portfolioService.getRealizedPnL(userId);
      
      res.status(200).json({
        success: true,
        data: realized
      });
    } catch (error) {
      next(error);
    }
  }

  // Belirli market pozisyonu
  async getMyMarketPosition(req, res, next) {
    try {
      const userId = req.user.id;
      const { marketId } = req.params;
      
      const position = await portfolioService.getMarketPosition(userId, marketId);
      
      res.status(200).json({
        success: true,
        data: position
      });
    } catch (error) {
      next(error);
    }
  }

  // Performans istatistikleri
  async getMyPerformance(req, res, next) {
    try {
      const userId = req.user.id;
      const performance = await portfolioService.getPerformanceStats(userId);
      
      res.status(200).json({
        success: true,
        data: performance
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PortfolioController();