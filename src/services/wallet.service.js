// src/services/wallet.service.js
const { User, Transaction, sequelize } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');

class WalletService {
  // Kullanıcının bakiyesini getir
  async getBalance(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'balance']
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    return {
      userId: user.id,
      username: user.username,
      balance: parseFloat(user.balance),
      currency: 'TRY'
    };
  }

  // Para yatırma (test/demo için)
  async deposit(userId, amount, description = 'Para yatırma') {
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır');
    }

    // Maximum deposit limit for demo
    if (amount > 100000) {
      throw ApiError.badRequest('Maksimum yatırma limiti 100.000 TL\'dir');
    }

    const t = await sequelize.transaction();

    try {
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      const previousBalance = parseFloat(user.balance);
      const newBalance = previousBalance + parseFloat(amount);

      // Bakiyeyi güncelle
      user.balance = newBalance;
      await user.save({ transaction: t });

      // Transaction kaydı oluştur
      const transaction = await Transaction.create({
        userId: user.id,
        type: 'deposit',
        amount: parseFloat(amount),
        description: description
      }, { transaction: t });

      await t.commit();

      // WebSocket üzerinden bakiye güncellemesi gönder
      try {
        await websocketServer.publishBalanceUpdate(userId, newBalance);
      } catch (wsError) {
        console.error('WebSocket balance update failed:', wsError.message);
      }

      return {
        success: true,
        transactionId: transaction.id,
        previousBalance: previousBalance,
        amount: parseFloat(amount),
        newBalance: newBalance,
        type: 'deposit',
        description: description,
        createdAt: transaction.createdAt
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Para çekme
  async withdraw(userId, amount, description = 'Para çekme') {
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır');
    }

    const t = await sequelize.transaction();

    try {
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      const previousBalance = parseFloat(user.balance);
      const withdrawAmount = parseFloat(amount);

      // Yeterli bakiye kontrolü
      if (previousBalance < withdrawAmount) {
        throw ApiError.badRequest('Yetersiz bakiye');
      }

      const newBalance = previousBalance - withdrawAmount;

      // Bakiyeyi güncelle
      user.balance = newBalance;
      await user.save({ transaction: t });

      // Transaction kaydı oluştur (negatif olarak)
      const transaction = await Transaction.create({
        userId: user.id,
        type: 'withdrawal',
        amount: -withdrawAmount, // Negatif olarak kaydet
        description: description
      }, { transaction: t });

      await t.commit();

      // WebSocket üzerinden bakiye güncellemesi gönder
      try {
        await websocketServer.publishBalanceUpdate(userId, newBalance);
      } catch (wsError) {
        console.error('WebSocket balance update failed:', wsError.message);
      }

      return {
        success: true,
        transactionId: transaction.id,
        previousBalance: previousBalance,
        amount: withdrawAmount,
        newBalance: newBalance,
        type: 'withdrawal',
        description: description,
        createdAt: transaction.createdAt
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Wallet işlem geçmişi
  async getHistory(userId, filters = {}) {
    const where = { userId };

    // Sadece wallet ile ilgili işlemleri filtrele (deposit, withdrawal)
    if (filters.type) {
      where.type = filters.type;
    } else {
      // Varsayılan olarak tüm wallet işlemlerini getir
      where.type = {
        [Op.in]: ['deposit', 'withdrawal']
      };
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

    const limit = Math.min(filters.limit || 50, 100); // Max 100
    const offset = filters.offset || 0;

    const transactions = await Transaction.findAll({
      where,
      attributes: ['id', 'type', 'amount', 'description', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Toplam işlem sayısı
    const total = await Transaction.count({ where });

    // İstatistikler
    const stats = await this.getWalletStats(userId);

    return {
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        description: tx.description,
        createdAt: tx.createdAt
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      },
      stats
    };
  }

  // Wallet istatistikleri
  async getWalletStats(userId) {
    const result = await Transaction.findAll({
      where: {
        userId,
        type: {
          [Op.in]: ['deposit', 'withdrawal']
        }
      },
      attributes: ['type', 'amount']
    });

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let depositCount = 0;
    let withdrawalCount = 0;

    result.forEach(tx => {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'deposit') {
        totalDeposits += amount;
        depositCount++;
      } else if (tx.type === 'withdrawal') {
        totalWithdrawals += Math.abs(amount);
        withdrawalCount++;
      }
    });

    return {
      totalDeposits: parseFloat(totalDeposits.toFixed(2)),
      totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
      netDeposits: parseFloat((totalDeposits - totalWithdrawals).toFixed(2)),
      depositCount,
      withdrawalCount
    };
  }
}

module.exports = new WalletService();
