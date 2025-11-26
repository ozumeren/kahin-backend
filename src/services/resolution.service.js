// src/services/resolution.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Share, User, Transaction, Order, sequelize } = db;

class ResolutionService {
  /**
   * Preview market resolution impact
   */
  async previewResolution(marketId, outcome) {
    const market = await Market.findByPk(marketId);

    if (!market) {
      throw new Error('Market bulunamadı');
    }

    if (market.status === 'resolved') {
      throw new Error('Market zaten sonuçlandırılmış');
    }

    // Validate outcome (can be true, false, or null for refund)
    if (outcome !== true && outcome !== false && outcome !== null) {
      throw new Error('Outcome true, false veya null olmalıdır');
    }

    // Get open orders that will be cancelled
    const openOrders = await Order.count({
      where: { marketId, status: 'OPEN' }
    });

    // Get all shares
    const allShares = await Share.findAll({
      where: { marketId, quantity: { [Op.gt]: 0 } },
      include: [{
        model: User,
        attributes: ['id', 'username', 'email']
      }]
    });

    const totalHolders = allShares.length;
    const yesHolders = allShares.filter(s => s.outcome === true).length;
    const noHolders = allShares.filter(s => s.outcome === false).length;

    let winners = [];
    let losers = [];
    let totalPayout = 0;

    if (outcome === null) {
      // PARTIAL RESOLUTION - Everyone gets refunded
      winners = allShares.map(share => ({
        userId: share.userId,
        username: share.User.username,
        email: share.User.email,
        outcome: share.outcome ? 'YES' : 'NO',
        shares: share.quantity,
        payout: parseFloat(share.quantity) * 1.0, // Full refund
        type: 'refund'
      }));
      totalPayout = winners.reduce((sum, w) => sum + w.payout, 0);
    } else {
      // NORMAL RESOLUTION
      const winningOutcome = outcome;
      const winningShares = allShares.filter(s => s.outcome === winningOutcome);
      const losingShares = allShares.filter(s => s.outcome !== winningOutcome);

      winners = winningShares.map(share => ({
        userId: share.userId,
        username: share.User.username,
        email: share.User.email,
        outcome: share.outcome ? 'YES' : 'NO',
        shares: share.quantity,
        payout: parseFloat(share.quantity) * 1.0,
        type: 'win'
      }));

      losers = losingShares.map(share => ({
        userId: share.userId,
        username: share.User.username,
        email: share.User.email,
        outcome: share.outcome ? 'YES' : 'NO',
        shares: share.quantity,
        loss: parseFloat(share.quantity) * 1.0,
        type: 'loss'
      }));

      totalPayout = winners.reduce((sum, w) => sum + w.payout, 0);
    }

    return {
      market: {
        id: market.id,
        title: market.title,
        status: market.status
      },
      resolution: {
        outcome: outcome === null ? 'REFUND' : outcome ? 'YES' : 'NO',
        type: outcome === null ? 'partial' : 'normal'
      },
      impact: {
        totalHolders,
        yesHolders,
        noHolders,
        winnersCount: winners.length,
        losersCount: losers.length,
        totalPayout: totalPayout.toFixed(2),
        openOrdersToCancel: openOrders
      },
      winners: winners.slice(0, 10), // Preview first 10
      losers: losers.slice(0, 10), // Preview first 10
      hasMore: {
        winners: winners.length > 10,
        losers: losers.length > 10
      }
    };
  }

  /**
   * Resolve market with enhanced features
   */
  async resolveMarket(marketId, resolutionData) {
    const {
      outcome,
      evidence = null,
      notes = null,
      resolvedBy
    } = resolutionData;

    const t = await sequelize.transaction();

    try {
      // 1. Get and lock market
      const market = await Market.findByPk(marketId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!market) {
        throw new Error('Market bulunamadı');
      }

      if (market.status === 'resolved') {
        throw new Error('Market zaten sonuçlandırılmış');
      }

      // Validate outcome
      if (outcome !== true && outcome !== false && outcome !== null) {
        throw new Error('Outcome true, false veya null olmalıdır');
      }

      // 2. Update market
      market.status = 'resolved';
      market.outcome = outcome;
      market.resolved_at = new Date();
      market.resolved_by = resolvedBy;
      market.resolution_notes = notes;
      market.resolution_evidence = evidence;
      await market.save({ transaction: t });

      // 3. Cancel all open orders
      const openOrders = await Order.findAll({
        where: { marketId, status: 'OPEN' },
        transaction: t
      });

      console.log(`📋 ${openOrders.length} açık emir iptal ediliyor...`);

      for (const order of openOrders) {
        if (order.type === 'BUY') {
          const refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
          await User.increment('balance', {
            by: refundAmount,
            where: { id: order.userId },
            transaction: t
          });

          await Transaction.create({
            userId: order.userId,
            marketId: order.marketId,
            type: 'refund',
            amount: refundAmount,
            description: `Market sonuçlandı - BUY emri iptal: ${refundAmount.toFixed(2)} TL iade`
          }, { transaction: t });
        } else if (order.type === 'SELL') {
          let share = await Share.findOne({
            where: {
              userId: order.userId,
              marketId: order.marketId,
              outcome: order.outcome
            },
            transaction: t
          });

          if (!share) {
            share = await Share.create({
              userId: order.userId,
              marketId: order.marketId,
              outcome: order.outcome,
              quantity: order.quantity
            }, { transaction: t });
          } else {
            share.quantity = parseInt(share.quantity) + parseInt(order.quantity);
            await share.save({ transaction: t });
          }
        }

        order.status = 'CANCELLED';
        await order.save({ transaction: t });
      }

      // 4. Handle payouts based on outcome type
      if (outcome === null) {
        // PARTIAL RESOLUTION - Refund everyone
        await this.refundAllHolders(marketId, market.title, t);
      } else {
        // NORMAL RESOLUTION - Pay winners
        await this.payWinners(marketId, market.title, outcome, t);
      }

      await t.commit();

      // Create resolution history entry
      await this.createResolutionHistory({
        marketId,
        outcome,
        type: outcome === null ? 'partial' : 'normal',
        resolvedBy,
        notes,
        evidence
      });

      return {
        success: true,
        message: outcome === null
          ? 'Market iptal edildi ve tüm kullanıcılara para iadesi yapıldı'
          : 'Market başarıyla sonuçlandırıldı ve ödemeler yapıldı',
        market
      };

    } catch (error) {
      await t.rollback();
      console.error('Market resolution hatası:', error);
      throw error;
    }
  }

  /**
   * Refund all share holders (partial resolution)
   */
  async refundAllHolders(marketId, marketTitle, transaction) {
    const allShares = await Share.findAll({
      where: { marketId, quantity: { [Op.gt]: 0 } },
      transaction
    });

    console.log(`💸 ${allShares.length} kullanıcıya para iadesi yapılıyor...`);

    for (const share of allShares) {
      const refundAmount = parseFloat(share.quantity) * 1.0;

      const user = await User.findByPk(share.userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (user) {
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction });

        await Transaction.create({
          userId: user.id,
          marketId: marketId,
          type: 'refund',
          amount: refundAmount,
          description: `Market iptal edildi: "${marketTitle}" - ${share.quantity} hisse iadesi`
        }, { transaction });
      }
    }

    return allShares.length;
  }

  /**
   * Pay winners (normal resolution)
   */
  async payWinners(marketId, marketTitle, winningOutcome, transaction) {
    const winningShares = await Share.findAll({
      where: { marketId, outcome: winningOutcome, quantity: { [Op.gt]: 0 } },
      transaction
    });

    console.log(`💰 ${winningShares.length} kazanana ödeme yapılıyor...`);

    let totalPayout = 0;

    for (const share of winningShares) {
      const payoutAmount = parseFloat(share.quantity) * 1.0;

      const user = await User.findByPk(share.userId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (user) {
        user.balance = parseFloat(user.balance) + payoutAmount;
        await user.save({ transaction });

        await Transaction.create({
          userId: user.id,
          marketId: marketId,
          type: 'payout',
          amount: payoutAmount,
          description: `Market kazancı: "${marketTitle}" - ${share.quantity} kazanan hisse`
        }, { transaction });

        totalPayout += payoutAmount;
      }
    }

    return { winnersCount: winningShares.length, totalPayout };
  }

  /**
   * Create resolution history entry
   */
  async createResolutionHistory(data) {
    // This will be stored in a separate table (we'll create it next)
    // For now, just log it
    console.log('📝 Resolution history:', data);
    return data;
  }

  /**
   * Schedule automatic resolution
   */
  async scheduleResolution(marketId, scheduledData) {
    const { resolveAt, outcome, notes } = scheduledData;

    const market = await Market.findByPk(marketId);

    if (!market) {
      throw new Error('Market bulunamadı');
    }

    if (market.status === 'resolved') {
      throw new Error('Market zaten sonuçlandırılmış');
    }

    // Update market with scheduled resolution
    await market.update({
      scheduled_resolution_at: resolveAt,
      scheduled_resolution_outcome: outcome,
      scheduled_resolution_notes: notes
    });

    return {
      success: true,
      message: 'Market çözümlemesi zamanlandı',
      market,
      scheduledFor: resolveAt
    };
  }

  /**
   * Get markets scheduled for resolution
   */
  async getScheduledResolutions() {
    const now = new Date();

    const markets = await Market.findAll({
      where: {
        status: { [Op.ne]: 'resolved' },
        scheduled_resolution_at: {
          [Op.lte]: now
        }
      },
      order: [['scheduled_resolution_at', 'ASC']]
    });

    return markets;
  }
}

module.exports = new ResolutionService();
