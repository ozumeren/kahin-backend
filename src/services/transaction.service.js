// src/services/transaction.service.js
const { Transaction, User, Market } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');

class TransactionService {
  // Kullanıcının tüm işlemlerini getir
  async getUserTransactions(userId, filters = {}) {
    const where = { userId };

    // Type filtresi (bet, payout, deposit, withdrawal)
    if (filters.type) {
      where.type = filters.type;
    }

    // Market filtresi
    if (filters.marketId) {
      where.marketId = filters.marketId;
    }

    // Tarih aralığı filtresi
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt[Op.gte] = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt[Op.lte] = new Date(filters.endDate);
      }
    }

    const transactions = await Transaction.findAll({
      where,
      include: [
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'outcome'],
          required: false // LEFT JOIN (market olmadan da transaction olabilir)
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50,
      offset: filters.offset || 0
    });

    // Toplam işlem sayısı
    const total = await Transaction.count({ where });

    return {
      transactions,
      pagination: {
        total,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
        hasMore: total > (filters.offset || 0) + (filters.limit || 50)
      }
    };
  }

  // Kullanıcının özet istatistikleri
  async getUserSummary(userId) {
    // Tüm işlemleri çek
    const transactions = await Transaction.findAll({
      where: { userId },
      attributes: ['type', 'amount']
    });

    // İstatistikleri hesapla
    const summary = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalBets: 0,
      totalPayouts: 0,
      netProfit: 0,
      transactionCount: transactions.length
    };

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      
      switch (tx.type) {
        case 'deposit':
          summary.totalDeposits += amount;
          break;
        case 'withdrawal':
          summary.totalWithdrawals += Math.abs(amount);
          break;
        case 'bet':
          summary.totalBets += Math.abs(amount);
          break;
        case 'payout':
          summary.totalPayouts += amount;
          break;
      }
    });

    // Net kar/zarar = (Payouts + Deposits) - (Bets + Withdrawals)
    summary.netProfit = (summary.totalPayouts + summary.totalDeposits) - 
                        (summary.totalBets + summary.totalWithdrawals);

    // ROI hesaplama (Total Bets > 0 ise)
    if (summary.totalBets > 0) {
      summary.roi = ((summary.netProfit / summary.totalBets) * 100).toFixed(2);
    } else {
      summary.roi = "0.00";
    }

    return summary;
  }

  // Belirli bir market için kullanıcının işlemleri
  async getUserMarketTransactions(userId, marketId) {
    const transactions = await Transaction.findAll({
      where: { userId, marketId },
      include: [
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'outcome']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Bu market için özet
    const summary = {
      totalBets: 0,
      totalPayouts: 0,
      netProfit: 0
    };

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'bet') {
        summary.totalBets += Math.abs(amount);
      } else if (tx.type === 'payout') {
        summary.totalPayouts += amount;
      }
    });

    summary.netProfit = summary.totalPayouts - summary.totalBets;

    return {
      transactions,
      summary
    };
  }

  // Sistem geneli istatistikler (admin için)
  async getSystemStats() {
    const stats = {
      totalTransactions: await Transaction.count(),
      totalVolume: 0,
      totalBets: 0,
      totalPayouts: 0,
      uniqueUsers: 0
    };

    // Tüm işlemleri topla
    const transactions = await Transaction.findAll({
      attributes: ['type', 'amount', 'userId']
    });

    const uniqueUserIds = new Set();

    transactions.forEach(tx => {
      const amount = parseFloat(Math.abs(tx.amount));
      stats.totalVolume += amount;
      
      if (tx.type === 'bet') {
        stats.totalBets += amount;
      } else if (tx.type === 'payout') {
        stats.totalPayouts += amount;
      }

      uniqueUserIds.add(tx.userId);
    });

    stats.uniqueUsers = uniqueUserIds.size;
    stats.platformRevenue = stats.totalBets - stats.totalPayouts;

    return stats;
  }
}

module.exports = new TransactionService();