// src/services/userBalance.service.js
const db = require('../models');
const { User, Transaction, sequelize } = db;

class UserBalanceService {
  /**
   * Adjust user balance (add or subtract)
   */
  async adjustBalance(userId, adjustmentData) {
    const {
      amount,
      reason,
      adjustedBy,
      type = 'correction' // 'correction', 'refund', 'compensation', 'penalty'
    } = adjustmentData;

    const t = await sequelize.transaction();

    try {
      // Get user with lock
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) {
        throw new Error('User not found');
      }

      const adjustmentAmount = parseFloat(amount);
      const oldBalance = parseFloat(user.balance);
      const newBalance = oldBalance + adjustmentAmount;

      // Update user balance
      user.balance = newBalance;
      await user.save({ transaction: t });

      // Create transaction record
      await Transaction.create({
        userId: user.id,
        marketId: null,
        type: type,
        amount: Math.abs(adjustmentAmount),
        description: `Balance ${adjustmentAmount > 0 ? 'increase' : 'decrease'}: ${reason} (Adjusted by admin)`,
        metadata: JSON.stringify({
          adjustedBy,
          oldBalance: oldBalance.toFixed(2),
          newBalance: newBalance.toFixed(2),
          reason
        })
      }, { transaction: t });

      await t.commit();

      return {
        success: true,
        message: 'Balance adjusted successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          oldBalance: oldBalance.toFixed(2),
          newBalance: newBalance.toFixed(2),
          adjustment: adjustmentAmount.toFixed(2)
        }
      };
    } catch (error) {
      await t.rollback();
      console.error('Balance adjustment error:', error);
      throw error;
    }
  }

  /**
   * Freeze user balance (prevent withdrawals)
   */
  async freezeBalance(userId, freezeData) {
    const { reason, frozenBy } = freezeData;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Add frozen flag to user metadata
    const metadata = user.metadata || {};
    metadata.balanceFrozen = true;
    metadata.frozenAt = new Date();
    metadata.frozenBy = frozenBy;
    metadata.freezeReason = reason;

    await user.update({ metadata });

    return {
      success: true,
      message: 'User balance frozen successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        frozen: true
      }
    };
  }

  /**
   * Unfreeze user balance
   */
  async unfreezeBalance(userId, unfreezeData) {
    const { unfrozenBy } = unfreezeData;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const metadata = user.metadata || {};
    metadata.balanceFrozen = false;
    metadata.unfrozenAt = new Date();
    metadata.unfrozenBy = unfrozenBy;

    await user.update({ metadata });

    return {
      success: true,
      message: 'User balance unfrozen successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        frozen: false
      }
    };
  }

  /**
   * Get user balance history (audit trail)
   */
  async getBalanceHistory(userId, options = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Transaction.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    return {
      transactions: rows.map(t => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount).toFixed(2),
        description: t.description,
        metadata: t.metadata,
        createdAt: t.createdAt
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    };
  }

  /**
   * Get balance adjustment history (admin actions only)
   */
  async getAdjustmentHistory(options = {}) {
    const { page = 1, limit = 50, userId = null } = options;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      type: {
        [sequelize.Sequelize.Op.in]: ['correction', 'compensation', 'penalty']
      }
    };

    if (userId) {
      where.userId = userId;
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    return {
      adjustments: rows.map(t => ({
        id: t.id,
        userId: t.userId,
        username: t.user?.username,
        email: t.user?.email,
        type: t.type,
        amount: parseFloat(t.amount).toFixed(2),
        description: t.description,
        metadata: t.metadata,
        createdAt: t.createdAt
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    };
  }
}

module.exports = new UserBalanceService();
