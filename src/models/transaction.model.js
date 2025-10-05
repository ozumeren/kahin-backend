// src/models/transaction.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING, // Örn: 'bet', 'payout', 'deposit'
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(18, 2), // Negatif (harcama) veya pozitif (kazanç) olabilir
    allowNull: false
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  }
  // Not: Bu işlemin hangi kullanıcıya ve hangi pazara ait olduğunu
  // "ilişkiler" (associations) ile belirteceğiz.
}, {
  tableName: 'transactions'
});

module.exports = Transaction;