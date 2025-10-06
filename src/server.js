// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const db = require('./models');
const redisClient = require('../config/redis'); // Sequelize modellerimizi buradan alıyoruz


const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
const marketRoutes = require('./routes/market.route');
const shareRoutes = require('./routes/share.route');
const orderRoutes = require('./routes/order.route');
const adminRoutes = require('./routes/admin.route');
const devRoutes = require('./routes/dev.route');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`Gelen İstek: ${req.method} ${req.originalUrl} - Host: ${req.headers.host}`);
  next();
});


app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/markets', marketRoutes);
app.use('/api/v1/shares', shareRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/admin', adminRoutes);


if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/dev', devRoutes);
}

app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Çalışıyor!');
});

async function startServer() {
  try {
    // Önce Redis'e bağlan
    await redisClient.connect();
    console.log('Redis bağlantısı başarıyla kuruldu.');

    // Sonra veritabanını senkronize et
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