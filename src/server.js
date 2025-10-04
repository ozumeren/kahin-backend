// src/server.js
const express = require('express');
const cors = require('cors');
const sequelize = require('../config/database');

const app = express();
const PORT = process.env.PORT || 8000; // Coolify genellikle 8000 portunu verir

// Middlewares
app.use(cors()); // CORS'u etkinleştir
app.use(express.json()); // Gelen JSON verilerini işle

// Ana Rota
app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Çalışıyor!');
});

// Veritabanı bağlantısını test et ve sunucuyu başlat
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Veritabanı bağlantısı başarıyla kuruldu.');
    app.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda başlatıldı.`);
    });
  } catch (error) {
    console.error('Veritabanına bağlanılamadı:', error);
  }
}

startServer();