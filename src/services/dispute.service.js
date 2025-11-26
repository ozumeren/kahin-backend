// src/services/dispute.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Dispute, Market, User, sequelize } = db;

class DisputeService {
  /**
   * Create a new dispute
   */
  async createDispute(disputeData) {
    const {
      marketId,
      userId,
      disputeType,
      disputeReason,
      disputeEvidence
    } = disputeData;

    // Verify market exists and is resolved
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw new Error('Market bulunamadı');
    }

    if (market.status !== 'resolved') {
      throw new Error('Sadece sonuçlandırılmış marketler için itiraz açılabilir');
    }

    // Check if user already has an open dispute for this market
    const existingDispute = await Dispute.findOne({
      where: {
        marketId,
        userId,
        status: {
          [Op.in]: ['pending', 'under_review']
        }
      }
    });

    if (existingDispute) {
      throw new Error('Bu market için zaten açık bir itirazınız var');
    }

    const dispute = await Dispute.create({
      marketId,
      userId,
      dispute_type: disputeType,
      dispute_reason: disputeReason,
      dispute_evidence: disputeEvidence,
      status: 'pending',
      priority: 'normal'
    });

    return dispute;
  }

  /**
   * Get all disputes with filters
   */
  async getAllDisputes(options = {}) {
    const {
      page = 1,
      limit = 50,
      status = null,
      priority = null,
      disputeType = null,
      marketId = null
    } = options;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (disputeType) where.dispute_type = disputeType;
    if (marketId) where.marketId = marketId;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Dispute.findAndCountAll({
      where,
      include: [
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'outcome', 'resolved_at']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit),
      offset
    });

    return {
      disputes: rows,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    };
  }

  /**
   * Get dispute by ID
   */
  async getDisputeById(disputeId) {
    const dispute = await Dispute.findByPk(disputeId, {
      include: [
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'outcome', 'resolved_at', 'resolution_notes', 'resolution_evidence']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ]
    });

    if (!dispute) {
      throw new Error('İtiraz bulunamadı');
    }

    return dispute;
  }

  /**
   * Get disputes for a specific market
   */
  async getMarketDisputes(marketId) {
    const disputes = await Dispute.findAll({
      where: { marketId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return disputes;
  }

  /**
   * Get user's disputes
   */
  async getUserDisputes(userId) {
    const disputes = await Dispute.findAll({
      where: { userId },
      include: [
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'outcome', 'resolved_at']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return disputes;
  }

  /**
   * Update dispute status
   */
  async updateDisputeStatus(disputeId, statusData) {
    const {
      status,
      reviewedBy = null,
      reviewNotes = null,
      resolutionAction = null,
      resolutionNotes = null
    } = statusData;

    const dispute = await Dispute.findByPk(disputeId);
    if (!dispute) {
      throw new Error('İtiraz bulunamadı');
    }

    const updateData = {
      status
    };

    if (status === 'under_review' || status === 'approved' || status === 'rejected') {
      updateData.reviewed_by = reviewedBy;
      updateData.review_notes = reviewNotes;
      updateData.reviewed_at = new Date();
    }

    if (status === 'resolved') {
      updateData.resolution_action = resolutionAction;
      updateData.resolution_notes = resolutionNotes;
    }

    await dispute.update(updateData);

    return dispute;
  }

  /**
   * Update dispute priority
   */
  async updateDisputePriority(disputeId, priority) {
    const dispute = await Dispute.findByPk(disputeId);
    if (!dispute) {
      throw new Error('İtiraz bulunamadı');
    }

    await dispute.update({ priority });
    return dispute;
  }

  /**
   * Upvote a dispute
   */
  async upvoteDispute(disputeId) {
    const dispute = await Dispute.findByPk(disputeId);
    if (!dispute) {
      throw new Error('İtiraz bulunamadı');
    }

    await dispute.increment('upvotes');
    await dispute.reload();

    // Auto-escalate priority if upvotes reach threshold
    if (dispute.upvotes >= 10 && dispute.priority === 'normal') {
      await dispute.update({ priority: 'high' });
    } else if (dispute.upvotes >= 20 && dispute.priority === 'high') {
      await dispute.update({ priority: 'urgent' });
    }

    return dispute;
  }

  /**
   * Get dispute statistics
   */
  async getDisputeStats() {
    const totalDisputes = await Dispute.count();

    const statusCounts = await Dispute.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const typeCounts = await Dispute.findAll({
      attributes: [
        'dispute_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['dispute_type']
    });

    const priorityCounts = await Dispute.findAll({
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['priority']
    });

    // Get pending disputes needing attention
    const pendingCount = await Dispute.count({
      where: { status: 'pending' }
    });

    const urgentCount = await Dispute.count({
      where: {
        priority: 'urgent',
        status: { [Op.in]: ['pending', 'under_review'] }
      }
    });

    return {
      total: totalDisputes,
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = parseInt(item.get('count'));
        return acc;
      }, {}),
      byType: typeCounts.reduce((acc, item) => {
        acc[item.dispute_type] = parseInt(item.get('count'));
        return acc;
      }, {}),
      byPriority: priorityCounts.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.get('count'));
        return acc;
      }, {}),
      needsAttention: {
        pending: pendingCount,
        urgent: urgentCount
      }
    };
  }
}

module.exports = new DisputeService();
