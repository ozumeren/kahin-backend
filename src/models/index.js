// src/models/index.js
const { Sequelize } = require('sequelize');
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');
const Transaction = require('./transaction.model');
const Order = require('./order.model');
const Trade = require('./trade.model'); // ✅ Import ekle

// User <-> Share
User.hasMany(Share, { foreignKey: 'userId' });
Share.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Share
Market.hasMany(Share, { foreignKey: 'marketId' });
Share.belongsTo(Market, { foreignKey: 'marketId' });

// User <-> Transaction
User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Transaction
Market.hasMany(Transaction, { foreignKey: 'marketId' });
Transaction.belongsTo(Market, { foreignKey: 'marketId' });

// User <-> Order
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Order
Market.hasMany(Order, { foreignKey: 'marketId' });
Order.belongsTo(Market, { foreignKey: 'marketId' });

// ===== Trade İlişkileri =====

// Buyer (Alıcı) ilişkisi
User.hasMany(Trade, { as: 'BuyTrades', foreignKey: 'buyerId' });
Trade.belongsTo(User, { as: 'Buyer', foreignKey: 'buyerId' });

// Seller (Satıcı) ilişkisi
User.hasMany(Trade, { as: 'SellTrades', foreignKey: 'sellerId' });
Trade.belongsTo(User, { as: 'Seller', foreignKey: 'sellerId' });

// Market ilişkisi
Market.hasMany(Trade, { foreignKey: 'marketId' });
Trade.belongsTo(Market, { foreignKey: 'marketId' });

// Order ilişkileri
Order.hasMany(Trade, { as: 'BuyTrades', foreignKey: 'buyOrderId' });
Trade.belongsTo(Order, { as: 'BuyOrder', foreignKey: 'buyOrderId' });

Order.hasMany(Trade, { as: 'SellTrades', foreignKey: 'sellOrderId' });
Trade.belongsTo(Order, { as: 'SellOrder', foreignKey: 'sellOrderId' });

const db = {
  sequelize,
  Sequelize,
  User,
  Market,
  Share,
  Transaction,
  Order,
  Trade // ✅ Export ekle
};

module.exports = db;