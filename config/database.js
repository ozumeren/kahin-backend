// config/database.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  
  // Bu, her SQL sorgusunu ve bağlantı aktivitesini konsola yazdırır.
  // Sorunun tam olarak nerede olduğunu bize gösterecek.
  logging: (msg) => console.log('[SEQUELIZE]', msg), 
  
  // Bu ayarlar, konteyner ortamlarında bağlantının kopmasını veya takılmasını engeller.
  pool: {
    max: 5,         // En fazla 5 bağlantı aç
    min: 0,         // En az 0 bağlantı tut
    acquire: 30000, // Bir bağlantı almak için 30 saniye bekle
    idle: 10000     // Bir bağlantıyı kapatmadan önce 10 saniye boşta bekle
  }
});

module.exports = sequelize;