// src/models/optionTrade.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const OptionTrade = sequelize.define('OptionTrade', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'market_options',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  trade_type: {
    type: DataTypes.ENUM('BUY', 'SELL'),
    allowNull: false
  },
  position_type: {
    type: DataTypes.ENUM('YES', 'NO'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false
  }
}, {
  tableName: 'option_trades',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = OptionTrade;   