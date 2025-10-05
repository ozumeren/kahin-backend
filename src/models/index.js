// src/models/index.js
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');

// İlişkileri Tanımlama
// Bir Kullanıcının birden çok hissesi olabilir
User.hasMany(Share, { foreignKey: 'userId' });
// Her Hisse bir Kullanıcıya aittir
Share.belongsTo(User, { foreignKey: 'userId' });

// Bir Pazarın birden çok hissesi olabilir
Market.hasMany(Share, { foreignKey: 'marketId' });
// Her Hisse bir Pazara aittir
Share.belongsTo(Market, { foreignKey: 'marketId' });

const db = {
  sequelize,
  Sequelize,
  User,
  Market,
  Share
};

module.exports = db;