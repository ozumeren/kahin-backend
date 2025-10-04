// config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Coolify'ın iç ağındaki bağlantılar için SSL ayarlarını kaldırdık.
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

module.exports = sequelize;