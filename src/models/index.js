// src/models/index.js
const { Sequelize } = require('sequelize');
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');
const Transaction = require('./transaction.model');
const Order = require('./order.model');

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


const db = {
  sequelize,
  Sequelize,
  User,
  Market,
  Share,
  Transaction,
  Order
};

module.exports = db;