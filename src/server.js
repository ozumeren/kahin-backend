// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const http = require('http');
const db = require('./models');
const redisClient = require('../config/redis');
const websocketServer = require('../config/websocket');
const marketAutomation = require('./services/market.automation.service');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
const marketRoutes = require('./routes/market.route');
const shareRoutes = require('./routes/share.route');
const orderRoutes = require('./routes/order.route');
const adminRoutes = require('./routes/admin.route');
const devRoutes = require('./routes/dev.route');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Host: ${req.headers.host}`);
  next();
});

// Ana sayfa
app.get('/', (req, res) => {
  res.json({
    message: 'Kahin Projesi Backend Sunucusu Çalışıyor!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      markets: '/api/v1/markets',
      shares: '/api/v1/shares',
      orders: '/api/v1/orders',
      admin: '/api/v1/admin',
      websocket: 'wss://api.kahinmarket.com/ws'
    }
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/markets', marketRoutes);
app.use('/api/v1/shares', shareRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/admin', adminRoutes);

// Dev route (sadece production dışında)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/dev', devRoutes);
}

// 404 Handler - Tanımlanmamış route'lar için
app.use(notFoundHandler);

// Error Handler - Tüm hataları yakala
app.use(errorHandler);

async function startServer() {
  try {
    // Önce Redis'e bağlan
    await redisClient.connect();
    console.log('✓ Redis bağlantısı başarıyla kuruldu.');

    // WebSocket sunucusunu başlat
    await websocketServer.initialize(server);

    // Sonra veritabanını senkronize et
    await db.sequelize.sync({ alter: true });
    console.log('✓ Veritabanı senkronizasyonu başarılı.');

    // Market otomasyonunu başlat
    marketAutomation.startAutomation();

    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ HTTP Sunucu ${PORT} portunda başlatıldı.`);
      console.log(`✓ WebSocket: wss://api.kahinmarket.com/ws`);
      console.log(`✓ Ortam: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API Base URL: https://api.kahinmarket.com/api/v1`);
      console.log(`✓ Market Otomasyonu: Aktif`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('✗ Sunucu başlatılırken hata oluştu:', error);
    process.exit(1);
  }
}

// Beklenmeyen hataları yakala
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  marketAutomation.stopAutomation();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  marketAutomation.stopAutomation();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM alındı, sunucu kapatılıyor...');
  marketAutomation.stopAutomation();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT alındı, sunucu kapatılıyor...');
  marketAutomation.stopAutomation();
  process.exit(0);
});

startServer();