// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const db = require('./models');
const redisClient = require('../config/redis');
const websocketServer = require('../config/websocket');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

// routes import...
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
const marketRoutes = require('./routes/market.route');
const shareRoutes = require('./routes/share.route');
const orderRoutes = require('./routes/order.route');
const transactionRoutes = require('./routes/transaction.route');
const portfolioRoutes = require('./routes/portfolio.route');
const adminRoutes = require('./routes/admin.route');
const devRoutes = require('./routes/dev.route');
const tradeRoutes = require('./routes/trade.route');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ DÜZELTME: CORS ayarlarını güncelle
app.use(cors({
  origin: [
    'https://kahinmarket.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Origin: ${req.headers.origin}`);
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
      transactions: '/api/v1/transactions',
      portfolio: '/api/v1/portfolio',
      trades: '/api/v1/trades',
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
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/portfolio', portfolioRoutes);
app.use('/api/v1/trades', tradeRoutes);
app.use('/api/v1/admin', adminRoutes);

// Dev route (sadece production dışında)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/dev', devRoutes);
}

// 404 Handler
app.use(notFoundHandler);

// Error Handler
app.use(errorHandler);

async function startServer() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('✓ Redis bağlantısı başarıyla kuruldu.');
    } else {
      console.log('✓ Redis zaten bağlı.');
    }

    await websocketServer.initialize(server);

    await db.sequelize.sync({ alter: true });
    console.log('✓ Veritabanı senkronizasyonu başarılı.');

    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ HTTP Sunucu ${PORT} portunda başlatıldı.`);
      console.log(`✓ WebSocket: wss://api.kahinmarket.com/ws`);
      console.log(`✓ Ortam: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API Base URL: https://api.kahinmarket.com/api/v1`);
      console.log(`✓ CORS: localhost:5173, localhost:5174, kahinmarket.com`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('✗ Sunucu başlatılırken hata oluştu:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();