// src/models/dispute.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Dispute = sequelize.define('Dispute', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  marketId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'market_id'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  // Dispute details
  dispute_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'incorrect_outcome',
    validate: {
      isIn: [['incorrect_outcome', 'insufficient_evidence', 'premature_resolution', 'technical_error', 'other']]
    }
  },
  dispute_reason: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  dispute_evidence: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Status
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'under_review', 'approved', 'rejected', 'resolved']]
    }
  },
  // Admin response
  reviewed_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  review_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Resolution
  resolution_action: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['no_action', 'market_corrected', 'partial_refund', 'full_refund', 'other']]
    }
  },
  resolution_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // User engagement
  upvotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Priority
  priority: {
    type: DataTypes.STRING,
    defaultValue: 'normal',
    validate: {
      isIn: [['low', 'normal', 'high', 'urgent']]
    }
  }
}, {
  tableName: 'disputes',
  timestamps: true,
  indexes: [
    {
      name: 'idx_disputes_market',
      fields: ['market_id']
    },
    {
      name: 'idx_disputes_user',
      fields: ['user_id']
    },
    {
      name: 'idx_disputes_status',
      fields: ['status']
    },
    {
      name: 'idx_disputes_type',
      fields: ['dispute_type']
    },
    {
      name: 'idx_disputes_priority',
      fields: ['priority', 'status']
    },
    {
      name: 'idx_disputes_created',
      fields: ['createdAt']
    }
  ]
});

module.exports = Dispute;
