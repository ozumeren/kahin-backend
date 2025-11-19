// src/services/wallet.service.js
const { User, Transaction, Order, Market, sequelize } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');
const redisClient = require('../../config/redis');

// Rate limiting configuration
const RATE_LIMITS = {
  DEPOSIT: {
    maxCount: 3,
    maxAmount: 10000,
    windowHours: 24
  },
  WITHDRAWAL: {
    maxCount: 2,
    maxAmount: 5000,
    windowHours: 24,
    minAmount: 10
  }
};

class WalletService {
  // Kullanıcının bakiyesini getir (enhanced with stats)
  async getBalance(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'balance', 'updated_at']
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    // Calculate locked balance from open orders
    const lockedBalance = await this.calculateLockedBalance(userId);
    const balance = parseFloat(user.balance);
    const availableBalance = Math.max(0, balance - lockedBalance);

    // Get comprehensive stats
    const stats = await this.getComprehensiveStats(userId);

    return {
      userId: user.id,
      username: user.username,
      balance: balance,
      available_balance: parseFloat(availableBalance.toFixed(2)),
      locked_balance: parseFloat(lockedBalance.toFixed(2)),
      currency: 'TRY',
      last_updated: user.updated_at,
      stats
    };
  }

  // Calculate balance locked in open orders
  async calculateLockedBalance(userId) {
    const openOrders = await Order.findAll({
      where: {
        userId,
        status: 'OPEN',
        type: 'BUY'
      },
      attributes: ['quantity', 'price']
    });

    let lockedAmount = 0;
    openOrders.forEach(order => {
      lockedAmount += parseFloat(order.quantity) * parseFloat(order.price);
    });

    return lockedAmount;
  }

  // Get comprehensive wallet statistics
  async getComprehensiveStats(userId) {
    const transactions = await Transaction.findAll({
      where: { userId },
      attributes: ['type', 'amount']
    });

    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let totalBet = 0;
    let totalWon = 0;

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      switch (tx.type) {
        case 'deposit':
          totalDeposited += amount;
          break;
        case 'withdrawal':
          totalWithdrawn += Math.abs(amount);
          break;
        case 'bet':
          totalBet += Math.abs(amount);
          break;
        case 'payout':
        case 'win':
          totalWon += amount;
          break;
      }
    });

    const netProfit = totalWon - totalBet;
    const roi = totalBet > 0 ? ((netProfit / totalBet) * 100) : 0;

    return {
      total_deposited: parseFloat(totalDeposited.toFixed(2)),
      total_withdrawn: parseFloat(totalWithdrawn.toFixed(2)),
      total_bet: parseFloat(totalBet.toFixed(2)),
      total_won: parseFloat(totalWon.toFixed(2)),
      net_profit: parseFloat(netProfit.toFixed(2)),
      roi: parseFloat(roi.toFixed(2))
    };
  }

  // Check rate limits for deposit/withdrawal
  async checkRateLimit(userId, type) {
    const limits = type === 'deposit' ? RATE_LIMITS.DEPOSIT : RATE_LIMITS.WITHDRAWAL;
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - limits.windowHours);

    const recentTransactions = await Transaction.findAll({
      where: {
        userId,
        type,
        createdAt: { [Op.gte]: windowStart }
      },
      attributes: ['amount']
    });

    const usedCount = recentTransactions.length;
    const usedAmount = recentTransactions.reduce((sum, tx) => {
      return sum + Math.abs(parseFloat(tx.amount));
    }, 0);

    return {
      usedCount,
      usedAmount,
      remainingCount: Math.max(0, limits.maxCount - usedCount),
      remainingAmount: Math.max(0, limits.maxAmount - usedAmount),
      maxCount: limits.maxCount,
      maxAmount: limits.maxAmount,
      isLimitExceeded: usedCount >= limits.maxCount || usedAmount >= limits.maxAmount
    };
  }

  // Para yatırma (test/demo için) with rate limiting
  async deposit(userId, amount, description = 'Para yatırma') {
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır');
    }

    const depositAmount = parseFloat(amount);

    // Check rate limits
    const limits = await this.checkRateLimit(userId, 'deposit');

    if (limits.usedCount >= RATE_LIMITS.DEPOSIT.maxCount) {
      throw ApiError.badRequest(`Günlük deposit limiti aşıldı (maksimum ${RATE_LIMITS.DEPOSIT.maxCount} işlem)`);
    }

    if (limits.usedAmount + depositAmount > RATE_LIMITS.DEPOSIT.maxAmount) {
      throw ApiError.badRequest(`Günlük deposit tutarı limiti aşıldı (maksimum ${RATE_LIMITS.DEPOSIT.maxAmount} TL, kalan: ${limits.remainingAmount.toFixed(2)} TL)`);
    }

    // Single transaction maximum
    if (depositAmount > 100000) {
      throw ApiError.badRequest('Tek seferde maksimum 100.000 TL yatırılabilir');
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
      const newBalance = previousBalance + depositAmount;

      // Bakiyeyi güncelle
      user.balance = newBalance;
      await user.save({ transaction: t });

      // Transaction kaydı oluştur
      const transaction = await Transaction.create({
        userId: user.id,
        type: 'deposit',
        amount: depositAmount,
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
        amount: depositAmount,
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

  // Para çekme with enhanced validation
  async withdraw(userId, amount, description = 'Para çekme') {
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır');
    }

    const withdrawAmount = parseFloat(amount);

    // Minimum withdrawal check
    if (withdrawAmount < RATE_LIMITS.WITHDRAWAL.minAmount) {
      throw ApiError.badRequest(`Minimum çekim tutarı ${RATE_LIMITS.WITHDRAWAL.minAmount} TL'dir`);
    }

    // Check rate limits
    const limits = await this.checkRateLimit(userId, 'withdrawal');

    if (limits.usedCount >= RATE_LIMITS.WITHDRAWAL.maxCount) {
      throw ApiError.badRequest(`Günlük çekim limiti aşıldı (maksimum ${RATE_LIMITS.WITHDRAWAL.maxCount} işlem)`);
    }

    if (limits.usedAmount + withdrawAmount > RATE_LIMITS.WITHDRAWAL.maxAmount) {
      throw ApiError.badRequest(`Günlük çekim tutarı limiti aşıldı (maksimum ${RATE_LIMITS.WITHDRAWAL.maxAmount} TL, kalan: ${limits.remainingAmount.toFixed(2)} TL)`);
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

      // Calculate available balance (excluding locked funds)
      const lockedBalance = await this.calculateLockedBalance(userId);
      const availableBalance = previousBalance - lockedBalance;

      // Yeterli bakiye kontrolü (available balance)
      if (availableBalance < withdrawAmount) {
        if (lockedBalance > 0) {
          throw ApiError.badRequest(`Yetersiz bakiye. Kullanılabilir bakiye: ${availableBalance.toFixed(2)} TL (${lockedBalance.toFixed(2)} TL açık emirlerde kilitli)`);
        }
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
        amount: -withdrawAmount,
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
        fee: 0,
        netAmount: withdrawAmount,
        newBalance: newBalance,
        type: 'withdrawal',
        status: 'completed',
        description: description,
        createdAt: transaction.createdAt
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Get daily limits status
  async getLimits(userId) {
    const depositLimits = await this.checkRateLimit(userId, 'deposit');
    const withdrawalLimits = await this.checkRateLimit(userId, 'withdrawal');

    // Calculate reset time (next day 00:00)
    const now = new Date();
    const resetsAt = new Date(now);
    resetsAt.setDate(resetsAt.getDate() + 1);
    resetsAt.setHours(0, 0, 0, 0);

    return {
      daily_limits: {
        deposit: {
          max_amount: RATE_LIMITS.DEPOSIT.maxAmount,
          max_count: RATE_LIMITS.DEPOSIT.maxCount,
          used_amount: parseFloat(depositLimits.usedAmount.toFixed(2)),
          used_count: depositLimits.usedCount,
          remaining_amount: parseFloat(depositLimits.remainingAmount.toFixed(2)),
          remaining_count: depositLimits.remainingCount,
          resets_at: resetsAt.toISOString()
        },
        withdrawal: {
          max_amount: RATE_LIMITS.WITHDRAWAL.maxAmount,
          max_count: RATE_LIMITS.WITHDRAWAL.maxCount,
          used_amount: parseFloat(withdrawalLimits.usedAmount.toFixed(2)),
          used_count: withdrawalLimits.usedCount,
          remaining_amount: parseFloat(withdrawalLimits.remainingAmount.toFixed(2)),
          remaining_count: withdrawalLimits.remainingCount,
          resets_at: resetsAt.toISOString()
        }
      },
      minimum_withdrawal: RATE_LIMITS.WITHDRAWAL.minAmount,
      minimum_deposit: 1.00
    };
  }

  // Get locked funds in open orders
  async getLockedFunds(userId) {
    const openOrders = await Order.findAll({
      where: {
        userId,
        status: 'OPEN',
        type: 'BUY'
      },
      include: [{
        model: Market,
        attributes: ['id', 'title']
      }],
      attributes: ['id', 'type', 'outcome', 'quantity', 'price', 'createdAt']
    });

    let totalLocked = 0;
    const lockedInOrders = openOrders.map(order => {
      const lockedAmount = parseFloat(order.quantity) * parseFloat(order.price);
      totalLocked += lockedAmount;

      return {
        order_id: order.id,
        market: order.Market ? {
          id: order.Market.id,
          title: order.Market.title
        } : null,
        type: order.type,
        outcome: order.outcome,
        quantity: order.quantity,
        price: parseFloat(order.price),
        locked_amount: parseFloat(lockedAmount.toFixed(2)),
        created_at: order.createdAt
      };
    });

    return {
      total_locked: parseFloat(totalLocked.toFixed(2)),
      locked_in_orders: lockedInOrders
    };
  }

  // Wallet işlem geçmişi (enhanced)
  async getHistory(userId, filters = {}) {
    const where = { userId };

    // Type filter - support multiple types
    if (filters.type) {
      const types = filters.type.split(',').map(t => t.trim());
      where.type = { [Op.in]: types };
    }

    // Market filter
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

    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const transactions = await Transaction.findAll({
      where,
      include: [{
        model: Market,
        attributes: ['id', 'title'],
        required: false
      }],
      attributes: ['id', 'type', 'amount', 'description', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Toplam işlem sayısı
    const total = await Transaction.count({ where });

    // Calculate summary for filtered results
    const allFilteredTx = await Transaction.findAll({
      where,
      attributes: ['amount']
    });

    let totalIn = 0;
    let totalOut = 0;
    allFilteredTx.forEach(tx => {
      const amount = parseFloat(tx.amount);
      if (amount > 0) {
        totalIn += amount;
      } else {
        totalOut += Math.abs(amount);
      }
    });

    return {
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        description: tx.description,
        status: 'completed',
        market: tx.Market ? {
          id: tx.Market.id,
          title: tx.Market.title
        } : null,
        created_at: tx.createdAt
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: total > offset + limit,
        total_pages: Math.ceil(total / limit),
        current_page: Math.floor(offset / limit) + 1
      },
      summary: {
        total_in: parseFloat(totalIn.toFixed(2)),
        total_out: parseFloat(totalOut.toFixed(2)),
        net: parseFloat((totalIn - totalOut).toFixed(2))
      }
    };
  }

  // Wallet istatistikleri (basic - for backwards compatibility)
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
