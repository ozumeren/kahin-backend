// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const sequelize = require('../config/database');
const User = require('./models/user.model'); // <-- User modelini import et

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Çalışıyor!');
});

async function startServer() {
  try {
    // { force: true } seçeneği her başlangıçta tabloyu silip yeniden oluşturur.
    // Geliştirme aşamasında kullanışlıdır, production'da kaldırılmalıdır.
    // Sadece { alter: true } kullanmak daha güvenlidir.
    await sequelize.sync({ alter: true });
    console.log('Veritabanı senkronizasyonu başarılı.');

    app.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda başlatıldı.`);
    });
  } catch (error) {
    console.error('Sunucu başlatılırken hata oluştu:', error);
  }
}

startServer();