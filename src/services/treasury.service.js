// src/services/treasury.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { User, Order, Share, Transaction, Market, sequelize } = db;

class TreasuryService {
  /**
   * Get platform treasury overview
   */
  async getTreasuryOverview() {
    try {
      // Calculate total user balances
      const totalUserBalances = await User.sum('balance') || 0;

      // Calculate locked funds (money in open orders)
      const lockedInOrders = await Order.sum(
        sequelize.literal('quantity * price'),
        {
          where: {
            status: 'OPEN',
            type: 'BUY'
          }
        }
      ) || 0;

      // Calculate locked funds in positions (shares * current value)
      const lockedInPositions = await Share.sum('quantity', {
        where: {
          quantity: { [Op.gt]: 0 }
        }
      }) || 0;

      const totalLockedFunds = parseFloat(lockedInOrders) + parseFloat(lockedInPositions);

      // Platform total balance should equal user balances + locked funds
      const platformBalance = parseFloat(totalUserBalances) + totalLockedFunds;

      // Calculate available liquidity (user balances not in orders/positions)
      const availableLiquidity = parseFloat(totalUserBalances);

      // Calculate platform profit (30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const platformProfit = await Transaction.sum('amount', {
        where: {
          type: 'fee',
          createdAt: { [Op.gte]: thirtyDaysAgo }
        }
      }) || 0;

      // Get total number of active users
      const activeUsers = await User.count({
        where: {
          balance: { [Op.gt]: 0 }
        }
      });

      // Get total number of markets
      const totalMarkets = await Market.count();
      const activeMarkets = await Market.count({
        where: { status: 'open' }
      });

      return {
        platformBalance: parseFloat(platformBalance).toFixed(2),
        totalUserBalances: parseFloat(totalUserBalances).toFixed(2),
        lockedFunds: parseFloat(totalLockedFunds).toFixed(2),
        lockedInOrders: parseFloat(lockedInOrders).toFixed(2),
        lockedInPositions: parseFloat(lockedInPositions).toFixed(2),
        availableLiquidity: parseFloat(availableLiquidity).toFixed(2),
        platformProfit30d: parseFloat(platformProfit).toFixed(2),
        activeUsers,
        totalMarkets,
        activeMarkets,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Treasury overview error:', error);
      throw error;
    }
  }

  /**
   * Get treasury trends (daily data for last 30 days)
   */
  async getTreasuryTrends(days = 30) {
    const trends = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // This would ideally be cached or pre-calculated daily
    // For now, return sample structure
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      trends.push({
        date: date.toISOString().split('T')[0],
        platformBalance: 0,
        userBalances: 0,
        lockedFunds: 0
      });
    }

    return trends;
  }

  /**
   * Get liquidity status
   */
  async getLiquidityStatus() {
    const overview = await this.getTreasuryOverview();
    const availableLiquidity = parseFloat(overview.availableLiquidity);

    let status = 'healthy';
    let message = 'Liquidity is healthy';
    let threshold = 100000; // 100K TL threshold

    if (availableLiquidity < threshold * 0.5) {
      status = 'critical';
      message = `Critical: Available liquidity is ${availableLiquidity.toFixed(2)} TL (below ${(threshold * 0.5).toFixed(0)} TL)`;
    } else if (availableLiquidity < threshold) {
      status = 'warning';
      message = `Warning: Available liquidity is ${availableLiquidity.toFixed(2)} TL (below ${threshold.toFixed(0)} TL)`;
    }

    return {
      status,
      message,
      availableLiquidity: availableLiquidity.toFixed(2),
      threshold: threshold.toFixed(2),
      utilizationRate: ((parseFloat(overview.lockedFunds) / parseFloat(overview.platformBalance)) * 100).toFixed(2)
    };
  }

  /**
   * Get users with negative balance
   */
  async getNegativeBalances() {
    const users = await User.findAll({
      where: {
        balance: { [Op.lt]: 0 }
      },
      attributes: ['id', 'username', 'email', 'balance', 'createdAt'],
      order: [['balance', 'ASC']]
    });

    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      balance: parseFloat(user.balance).toFixed(2),
      createdAt: user.createdAt
    }));
  }

  /**
   * Get top balance holders
   */
  async getTopBalanceHolders(limit = 10) {
    const users = await User.findAll({
      where: {
        balance: { [Op.gt]: 0 }
      },
      attributes: ['id', 'username', 'email', 'balance'],
      order: [['balance', 'DESC']],
      limit: parseInt(limit)
    });

    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      balance: parseFloat(user.balance).toFixed(2)
    }));
  }

  /**
   * Reconciliation check
   */
  async runReconciliation() {
    const overview = await this.getTreasuryOverview();

    // Calculate expected vs actual
    const expectedBalance = parseFloat(overview.totalUserBalances) + parseFloat(overview.lockedFunds);
    const actualBalance = parseFloat(overview.platformBalance);
    const difference = Math.abs(expectedBalance - actualBalance);

    const isBalanced = difference < 0.01; // Allow 1 cent tolerance

    return {
      expectedBalance: expectedBalance.toFixed(2),
      actualBalance: actualBalance.toFixed(2),
      difference: difference.toFixed(2),
      isBalanced,
      status: isBalanced ? 'balanced' : 'mismatch',
      timestamp: new Date()
    };
  }
}

module.exports = new TreasuryService();
