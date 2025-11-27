// src/services/deposit.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Deposit, User, Transaction, sequelize } = db;

class DepositService {
  /**
   * Create deposit record (manual entry by admin or user)
   */
  async createDepositRecord(depositData) {
    const { userId, amount, paymentMethod, referenceNumber, proofUrl, metadata } = depositData;

    const t = await sequelize.transaction();

    try {
      // Verify user exists
      const user = await User.findByPk(userId, { transaction: t });
      if (!user) {
        throw new Error('User not found');
      }

      // Create deposit record
      const deposit = await Deposit.create({
        userId,
        amount,
        paymentMethod: paymentMethod || 'bank_transfer',
        referenceNumber,
        proofUrl,
        status: 'pending',
        metadata: metadata || {}
      }, { transaction: t });

      await t.commit();

      return deposit;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Get all deposits with filters (optimized)
   */
  async getAllDeposits(filters = {}) {
    const { status, userId, page = 1, limit = 50, startDate, endDate, referenceNumber } = filters;

    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (referenceNumber) {
      where.referenceNumber = { [Op.iLike]: `%${referenceNumber}%` };
    }
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
      Deposit.count({ where }),
      Deposit.findAll({
        where,
        include: [
          {
            model: User,
            attributes: ['id', 'username', 'email', 'balance']
          },
          {
            model: User,
            as: 'Verifier',
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
      deposits: rows,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    };
  }

  /**
   * Get pending deposits count
   */
  async getPendingCount() {
    return await Deposit.count({
      where: { status: 'pending' }
    });
  }

  /**
   * Get deposit by ID
   */
  async getDepositById(id) {
    const deposit = await Deposit.findByPk(id, {
      include: [
        {
          model: User,
          attributes: ['id', 'username', 'email', 'balance']
        },
        {
          model: User,
          as: 'Verifier',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ]
    });

    if (!deposit) {
      throw new Error('Deposit not found');
    }

    return deposit;
  }

  /**
   * Verify and credit deposit
   */
  async verifyDeposit(depositId, verifierId, verificationNotes) {
    const t = await sequelize.transaction();

    try {
      // Get deposit
      const deposit = await Deposit.findByPk(depositId, {
        include: [{ model: User }],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!deposit) {
        throw new Error('Deposit not found');
      }

      if (deposit.status !== 'pending') {
        throw new Error(`Deposit is already ${deposit.status}`);
      }

      // Get user with lock
      const user = await User.findByPk(deposit.userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      // Credit balance
      const oldBalance = parseFloat(user.balance);
      const newBalance = oldBalance + parseFloat(deposit.amount);
      user.balance = newBalance.toFixed(2);
      await user.save({ transaction: t });

      // Update deposit
      deposit.status = 'verified';
      deposit.verifiedBy = verifierId;
      deposit.verifiedAt = new Date();
      deposit.verificationNotes = verificationNotes || '';
      await deposit.save({ transaction: t });

      // Create transaction record
      await Transaction.create({
        userId: deposit.userId,
        type: 'deposit',
        amount: parseFloat(deposit.amount),
        description: `Deposit verified - ${deposit.paymentMethod}${deposit.referenceNumber ? ' (Ref: ' + deposit.referenceNumber + ')' : ''}${verificationNotes ? ': ' + verificationNotes : ''}`,
        metadata: JSON.stringify({
          depositId: deposit.id,
          verifierId,
          referenceNumber: deposit.referenceNumber,
          oldBalance,
          newBalance
        })
      }, { transaction: t });

      await t.commit();

      return deposit;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Reject deposit
   */
  async rejectDeposit(depositId, verifierId, verificationNotes) {
    const t = await sequelize.transaction();

    try {
      const deposit = await Deposit.findByPk(depositId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!deposit) {
        throw new Error('Deposit not found');
      }

      if (deposit.status !== 'pending') {
        throw new Error(`Deposit is already ${deposit.status}`);
      }

      deposit.status = 'rejected';
      deposit.verifiedBy = verifierId;
      deposit.verifiedAt = new Date();
      deposit.verificationNotes = verificationNotes || '';
      await deposit.save({ transaction: t });

      await t.commit();

      return deposit;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Get deposit stats
   */
  async getDepositStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await Deposit.findAll({
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

module.exports = new DepositService();
