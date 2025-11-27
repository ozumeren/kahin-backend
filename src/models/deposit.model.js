// src/models/deposit.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Deposit = sequelize.define('Deposit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  amount: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  paymentMethod: {
    type: DataTypes.ENUM('bank_transfer', 'credit_card', 'digital_wallet'),
    allowNull: false,
    defaultValue: 'bank_transfer',
    field: 'payment_method'
  },
  referenceNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'reference_number',
    comment: 'Bank reference, transaction ID, etc.'
  },
  proofUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'proof_url',
    comment: 'URL to uploaded payment proof/receipt'
  },
  status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'processing'),
    allowNull: false,
    defaultValue: 'pending'
  },
  verifiedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'verified_by',
    comment: 'Admin who verified/rejected'
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'verified_at'
  },
  verificationNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'verification_notes'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional metadata like sender info, etc.'
  }
}, {
  tableName: 'deposits',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Deposit;
