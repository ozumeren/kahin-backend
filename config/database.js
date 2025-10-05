// config/database.js
const { Sequelize } = require('sequelize');

// Coolify ortam değişkenlerini otomatik olarak verdiği için dotenv'a gerek yok.
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  // --- YENİ HATA AYIKLAMA KODU ---
  // Bu, her SQL sorgusunu konsola yazdırır.
  logging: console.log
  // ---------------------------------
});

module.exports = sequelize;