// src/models/contractResolutionEvidence.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ContractResolutionEvidence = sequelize.define('ContractResolutionEvidence', {
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

  // Evidence Details
  source_agency: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  evidence_type: {
    type: DataTypes.STRING(100)
  },
  evidence_url: {
    type: DataTypes.TEXT
  },
  evidence_data: {
    type: DataTypes.JSONB,
    get() {
      const rawValue = this.getDataValue('evidence_data');
      return rawValue ? JSON.parse(JSON.stringify(rawValue)) : null;
    }
  },
  evidence_file_path: {
    type: DataTypes.TEXT
  },

  // Verification
  collected_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  collected_by: {
    type: DataTypes.UUID
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verified_by: {
    type: DataTypes.UUID
  },
  verified_at: {
    type: DataTypes.DATE
  },

  // Metadata
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'contract_resolution_evidence',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = ContractResolutionEvidence;
