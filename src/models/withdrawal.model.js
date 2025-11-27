// src/models/withdrawal.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Withdrawal = sequelize.define('Withdrawal', {
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
  bankDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'bank_details',
    comment: 'IBAN, account holder name, bank name, etc.'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'processing', 'completed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  reviewedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reviewed_by',
    comment: 'Admin who approved/rejected'
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reviewed_at'
  },
  reviewNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'review_notes'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional metadata like IP, device info, etc.'
  }
}, {
  tableName: 'withdrawals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Withdrawal;
