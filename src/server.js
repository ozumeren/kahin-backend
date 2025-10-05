// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const db = require('./models'); // Sequelize modellerimizi buradan alıyoruz

// Rotaları import et
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
const marketRoutes = require('./routes/market.route');
const shareRoutes = require('./routes/share.route');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`Gelen İstek: ${req.method} ${req.originalUrl} - Host: ${req.headers.host}`);
  next();
});

// API Rotaları
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/markets', marketRoutes);
app.use('/api/v1/shares', shareRoutes);

app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Çalışıyor!');
});

async function startServer() {
  try {
    // Tüm modelleri veritabanı ile senkronize et
    await db.sequelize.sync({ alter: true });
    console.log('Veritabanı senkronizasyonu başarılı.');

    app.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda başlatıldı.`);
    });
  } catch (error) {
    console.error('Sunucu başlatılırken hata oluştu:', error);
  }
}

startServer();