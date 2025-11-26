// src/models/resolutionHistory.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ResolutionHistory = sequelize.define('ResolutionHistory', {
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
  outcome: {
    type: DataTypes.BOOLEAN,
    allowNull: true // null = refund/partial resolution
  },
  resolution_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'normal', // 'normal', 'partial', 'disputed', 'corrected'
    validate: {
      isIn: [['normal', 'partial', 'disputed', 'corrected']]
    }
  },
  resolved_by: {
    type: DataTypes.UUID,
    allowNull: false
  },
  resolution_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolution_evidence: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Impact metrics
  total_holders: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  winners_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  losers_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_payout: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  open_orders_cancelled: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Previous state (for corrections)
  previous_outcome: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  correction_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Metadata
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'resolution_history',
  timestamps: true,
  indexes: [
    {
      name: 'idx_resolution_history_market',
      fields: ['market_id']
    },
    {
      name: 'idx_resolution_history_resolved_by',
      fields: ['resolved_by']
    },
    {
      name: 'idx_resolution_history_type',
      fields: ['resolution_type']
    },
    {
      name: 'idx_resolution_history_date',
      fields: ['resolved_at']
    }
  ]
});

module.exports = ResolutionHistory;
