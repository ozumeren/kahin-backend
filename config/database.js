// config/database.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  
  // Hata ayıklama loglaması kalsın
  logging: (msg) => console.log('[SEQUELIZE]', msg), 
  
  // Bağlantı havuzu ayarları kalsın
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  
  // --- EN ÖNEMLİ YENİ KOD ---
  // Coolify'ın iç ağındaki veritabanları SSL gerektirmez.
  // Bu ayarı false yapmak, bağlantının takılmasını önler.
  dialectOptions: {
    ssl: false 
  }
  // -------------------------
});

module.exports = sequelize;