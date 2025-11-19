// src/controllers/wallet.controller.js
const walletService = require('../services/wallet.service');

class WalletController {
  // GET /api/v1/wallet/balance - Bakiye sorgulama (enhanced)
  async getBalance(req, res, next) {
    try {
      const userId = req.user.id;
      const balance = await walletService.getBalance(userId);

      res.status(200).json({
        success: true,
        data: balance
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/wallet/deposit - Para yatırma (test/demo)
  async deposit(req, res, next) {
    try {
      const userId = req.user.id;
      const { amount, description } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: 'Miktar gereklidir'
        });
      }

      const result = await walletService.deposit(userId, amount, description);

      res.status(200).json({
        success: true,
        message: 'Para yatırma işlemi başarılı',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/wallet/withdraw - Para çekme
  async withdraw(req, res, next) {
    try {
      const userId = req.user.id;
      const { amount, description } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: 'Miktar gereklidir'
        });
      }

      const result = await walletService.withdraw(userId, amount, description);

      res.status(200).json({
        success: true,
        message: 'Para çekme işlemi başarılı',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/wallet/history - Wallet işlem geçmişi
  async getHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { type, startDate, endDate, limit, offset, marketId } = req.query;

      const filters = {
        type,
        startDate,
        endDate,
        marketId,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      };

      const history = await walletService.getHistory(userId, filters);

      res.status(200).json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/wallet/limits - Günlük limitleri göster
  async getLimits(req, res, next) {
    try {
      const userId = req.user.id;
      const limits = await walletService.getLimits(userId);

      res.status(200).json({
        success: true,
        data: limits
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/wallet/locked-funds - Kilitli bakiyeyi göster
  async getLockedFunds(req, res, next) {
    try {
      const userId = req.user.id;
      const lockedFunds = await walletService.getLockedFunds(userId);

      res.status(200).json({
        success: true,
        data: lockedFunds
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WalletController();
