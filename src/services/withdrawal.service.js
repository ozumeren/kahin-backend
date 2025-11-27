// src/services/withdrawal.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Withdrawal, User, Transaction, sequelize } = db;

class WithdrawalService {
  /**
   * Create withdrawal request
   */
  async createWithdrawalRequest(userId, withdrawalData) {
    const { amount, paymentMethod, bankDetails } = withdrawalData;

    const t = await sequelize.transaction();

    try {
      // Get user
      const user = await User.findByPk(userId, { transaction: t });
      if (!user) {
        throw new Error('User not found');
      }

      // Validate balance
      if (parseFloat(user.balance) < parseFloat(amount)) {
        throw new Error(`Insufficient balance. Available: ${user.balance} TL`);
      }

      // Create withdrawal request
      const withdrawal = await Withdrawal.create({
        userId,
        amount,
        paymentMethod: paymentMethod || 'bank_transfer',
        bankDetails,
        status: 'pending',
        metadata: {
          userBalance: user.balance,
          requestedAt: new Date()
        }
      }, { transaction: t });

      await t.commit();

      return withdrawal;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Get all withdrawals with filters (optimized)
   */
  async getAllWithdrawals(filters = {}) {
    const { status, userId, page = 1, limit = 50, startDate, endDate } = filters;

    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (startDate) {
      where.createdAt = { [Op.gte]: new Date(startDate) };
    }
    if (endDate) {
      if (where.createdAt) {
        where.createdAt[Op.lte] = new Date(endDate);
      } else {
        where.createdAt = { [Op.lte]: new Date(endDate) };
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Optimize: Run count and data queries in parallel
    const [count, rows] = await Promise.all([
      Withdrawal.count({ where }),
      Withdrawal.findAll({
        where,
        include: [
          {
            model: User,
            attributes: ['id', 'username', 'email', 'balance']
          },
          {
            model: User,
            as: 'Reviewer',
            attributes: ['id', 'username', 'email'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset,
        subQuery: false // Optimize join queries
      })
    ]);

    return {
      withdrawals: rows,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    };
  }

  /**
   * Get pending withdrawals count
   */
  async getPendingCount() {
    return await Withdrawal.count({
      where: { status: 'pending' }
    });
  }

  /**
   * Get withdrawal by ID
   */
  async getWithdrawalById(id) {
    const withdrawal = await Withdrawal.findByPk(id, {
      include: [
        {
          model: User,
          attributes: ['id', 'username', 'email', 'balance']
        },
        {
          model: User,
          as: 'Reviewer',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ]
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    return withdrawal;
  }

  /**
   * Approve withdrawal
   */
  async approveWithdrawal(withdrawalId, reviewerId, reviewNotes) {
    const t = await sequelize.transaction();

    try {
      // Get withdrawal
      const withdrawal = await Withdrawal.findByPk(withdrawalId, {
        include: [{ model: User }],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new Error(`Withdrawal is already ${withdrawal.status}`);
      }

      // Get user with lock
      const user = await User.findByPk(withdrawal.userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      // Validate balance (in case balance changed)
      if (parseFloat(user.balance) < parseFloat(withdrawal.amount)) {
        throw new Error(`Insufficient balance. User balance: ${user.balance} TL`);
      }

      // Deduct balance
      const newBalance = parseFloat(user.balance) - parseFloat(withdrawal.amount);
      user.balance = newBalance.toFixed(2);
      await user.save({ transaction: t });

      // Update withdrawal
      withdrawal.status = 'approved';
      withdrawal.reviewedBy = reviewerId;
      withdrawal.reviewedAt = new Date();
      withdrawal.reviewNotes = reviewNotes || '';
      await withdrawal.save({ transaction: t });

      // Create transaction record
      await Transaction.create({
        userId: withdrawal.userId,
        type: 'withdrawal',
        amount: -parseFloat(withdrawal.amount),
        description: `Withdrawal approved - ${withdrawal.paymentMethod}${reviewNotes ? ': ' + reviewNotes : ''}`,
        metadata: JSON.stringify({
          withdrawalId: withdrawal.id,
          reviewerId,
          oldBalance: parseFloat(user.balance) + parseFloat(withdrawal.amount),
          newBalance
        })
      }, { transaction: t });

      await t.commit();

      return withdrawal;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Reject withdrawal
   */
  async rejectWithdrawal(withdrawalId, reviewerId, reviewNotes) {
    const t = await sequelize.transaction();

    try {
      const withdrawal = await Withdrawal.findByPk(withdrawalId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new Error(`Withdrawal is already ${withdrawal.status}`);
      }

      withdrawal.status = 'rejected';
      withdrawal.reviewedBy = reviewerId;
      withdrawal.reviewedAt = new Date();
      withdrawal.reviewNotes = reviewNotes || '';
      await withdrawal.save({ transaction: t });

      await t.commit();

      return withdrawal;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Get withdrawal stats
   */
  async getWithdrawalStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await Withdrawal.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      where: {
        createdAt: { [Op.gte]: startDate }
      },
      group: ['status'],
      raw: true
    });

    return {
      period: `${days} days`,
      stats: stats.map(s => ({
        status: s.status,
        count: parseInt(s.count),
        total: parseFloat(s.total || 0).toFixed(2)
      }))
    };
  }
}

module.exports = new WithdrawalService();
