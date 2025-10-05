// src/models/index.js
const { Sequelize } = require('sequelize'); // <-- EKSİK OLAN SATIR BUYDU
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');

// İlişkileri Tanımlama
User.hasMany(Share, { foreignKey: 'userId' });
Share.belongsTo(User, { foreignKey: 'userId' });

Market.hasMany(Share, { foreignKey: 'marketId' });
Share.belongsTo(Market, { foreignKey: 'marketId' });

const db = {
  sequelize,
  Sequelize, // <-- BU SATIRIN ÇALIŞABİLMESİ İÇİN YUKARIDA IMPORT ETTİK
  User,
  Market,
  Share
};

module.exports = db;