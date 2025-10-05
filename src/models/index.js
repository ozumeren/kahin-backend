// src/models/index.js
const { Sequelize } = require('sequelize');
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');
const Transaction = require('./transaction.model'); // YENİ

// User <-> Share
User.hasMany(Share, { foreignKey: 'userId' });
Share.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Share
Market.hasMany(Share, { foreignKey: 'marketId' });
Share.belongsTo(Market, { foreignKey: 'marketId' });

// User <-> Transaction (YENİ)
User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Transaction (YENİ)
Market.hasMany(Transaction, { foreignKey: 'marketId' });
Transaction.belongsTo(Market, { foreignKey: 'marketId' });


const db = {
  sequelize,
  Sequelize,
  User,
  Market,
  Share,
  Transaction // YENİ
};

module.exports = db;