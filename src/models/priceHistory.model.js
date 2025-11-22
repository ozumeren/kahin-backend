// src/models/priceHistory.model.js
// Stores historical price data for markets (OHLCV candlestick data)
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PriceHistory = sequelize.define('PriceHistory', {
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
    type: DataTypes.BOOLEAN, // true = YES, false = NO
    allowNull: false
  },
  interval: {
    type: DataTypes.ENUM('1m', '5m', '15m', '1h', '4h', '1d'),
    allowNull: false,
    defaultValue: '1h'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false
  },
  open: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  high: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  low: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  close: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  volume: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  trade_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  vwap: {
    type: DataTypes.DECIMAL(10, 4), // Volume Weighted Average Price
    allowNull: true
  }
}, {
  tableName: 'price_history',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['market_id', 'outcome', 'interval', 'timestamp'],
      name: 'idx_price_history_unique'
    },
    {
      fields: ['market_id', 'outcome', 'interval'],
      name: 'idx_price_history_market_interval'
    },
    {
      fields: ['timestamp'],
      name: 'idx_price_history_timestamp'
    }
  ]
});

module.exports = PriceHistory;
