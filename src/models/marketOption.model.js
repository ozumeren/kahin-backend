// src/models/marketOption.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MarketOption = sequelize.define('MarketOption', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  market_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'markets',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  option_text: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  option_image_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  option_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_yes_volume: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  total_no_volume: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  yes_price: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 50.00
  },
  no_price: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 50.00
  },
  probability: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 50.00
  }
}, {
  tableName: 'market_options',
  timestamps: true,
  underscored: true
});

module.exports = MarketOption;