// src/models/marketContract.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MarketContract = sequelize.define('MarketContract', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },

  // Basic Info
  contract_code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  market_id: {
    type: DataTypes.UUID
  },

  // Contract Specification
  scope: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  underlying: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  source_agencies: {
    type: DataTypes.JSONB,
    allowNull: false,
    get() {
      const rawValue = this.getDataValue('source_agencies');
      return rawValue ? JSON.parse(JSON.stringify(rawValue)) : [];
    }
  },
  payout_criterion: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  settlement_value: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.00
  },

  // Expiration Details
  expiration_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  expiration_time: {
    type: DataTypes.TIME,
    defaultValue: '10:00:00'
  },
  expiration_timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'America/New_York'
  },
  expiration_value_definition: {
    type: DataTypes.TEXT
  },

  // Contingency Rules
  contingency_rules: {
    type: DataTypes.JSONB,
    get() {
      const rawValue = this.getDataValue('contingency_rules');
      return rawValue ? JSON.parse(JSON.stringify(rawValue)) : [];
    }
  },
  postponement_policy: {
    type: DataTypes.TEXT
  },
  review_process_rules: {
    type: DataTypes.TEXT
  },
  dispute_resolution_process: {
    type: DataTypes.TEXT
  },

  // Additional Terms
  market_type: {
    type: DataTypes.STRING(50)
  },
  tick_size: {
    type: DataTypes.DECIMAL(10, 4),
    defaultValue: 0.01
  },
  position_limit: {
    type: DataTypes.INTEGER
  },
  trading_hours: {
    type: DataTypes.JSONB,
    get() {
      const rawValue = this.getDataValue('trading_hours');
      return rawValue ? JSON.parse(JSON.stringify(rawValue)) : null;
    }
  },

  // Metadata
  created_by: {
    type: DataTypes.UUID
  },
  reviewed_by: {
    type: DataTypes.UUID
  },
  approved_by: {
    type: DataTypes.UUID
  },

  // Status
  status: {
    type: DataTypes.ENUM('draft', 'pending_review', 'approved', 'active', 'expired', 'resolved'),
    defaultValue: 'draft'
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  parent_contract_id: {
    type: DataTypes.UUID
  },

  // Legal & Compliance
  cftc_filing_reference: {
    type: DataTypes.STRING(255)
  },
  legal_notes: {
    type: DataTypes.TEXT
  },
  risk_disclosures: {
    type: DataTypes.TEXT
  },

  // Resolution
  resolved_outcome: {
    type: DataTypes.BOOLEAN
  },
  expiration_value: {
    type: DataTypes.DECIMAL(20, 8)
  },
  resolution_notes: {
    type: DataTypes.TEXT
  },

  // Timestamps
  reviewed_at: {
    type: DataTypes.DATE
  },
  approved_at: {
    type: DataTypes.DATE
  },
  published_at: {
    type: DataTypes.DATE
  },
  resolved_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'market_contracts',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = MarketContract;
