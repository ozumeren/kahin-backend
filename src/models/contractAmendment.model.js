// src/models/contractAmendment.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ContractAmendment = sequelize.define('ContractAmendment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  contract_id: {
    type: DataTypes.UUID,
    allowNull: false
  },

  // Amendment Details
  amendment_type: {
    type: DataTypes.STRING(100)
  },
  field_changed: {
    type: DataTypes.STRING(255)
  },
  old_value: {
    type: DataTypes.TEXT
  },
  new_value: {
    type: DataTypes.TEXT
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false
  },

  // Approval
  created_by: {
    type: DataTypes.UUID
  },
  approved_by: {
    type: DataTypes.UUID
  },
  approved_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'contract_amendments',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = ContractAmendment;
