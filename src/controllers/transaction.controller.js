// src/controllers/transaction.controller.js
const transactionService = require('../services/transaction.service');

class TransactionController {
  // Kullanıcının işlem geçmişi
  async getMyTransactions(req, res, next) {
    try {
      const userId = req.user.id;
      const filters = {
        type: req.query.type,
        marketId: req.query.marketId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await transactionService.getUserTransactions(userId, filters);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Kullanıcının özet istatistikleri
  async getMySummary(req, res, next) {
    try {
      const userId = req.user.id;
      const summary = await transactionService.getUserSummary(userId);
      
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  // Belirli bir market için kullanıcının işlemleri
  async getMyMarketTransactions(req, res, next) {
    try {
      const userId = req.user.id;
      const { marketId } = req.params;
      
      const result = await transactionService.getUserMarketTransactions(userId, marketId);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Sistem geneli istatistikler (admin only)
  async getSystemStats(req, res, next) {
    try {
      const stats = await transactionService.getSystemStats();
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TransactionController();