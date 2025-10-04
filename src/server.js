// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const sequelize = require('../config/database');
const User = require('./models/user.model');
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route'); 

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Ana API rotalarını tanımla
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);

app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Çalışıyor!');
});

async function startServer() {
  try {
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