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
const migration = require('../migrations/add-multiple-choice-support');

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
const optionRoutes = require('./routes/option.route');
const marketService = require('./services/market.service');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ CORS ayarları - Admin CMS dahil
app.use(cors({
  origin: [
    'https://kahinmarket.com',
    'https://app.kahinmarket.com',
    'https://admin.kahinmarket.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // OPTIONS ekle
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 // 24 saat preflight cache
}));

// ✅ Preflight requestler için explicit handler ekle
app.options('*', cors()); // Tüm route'lar için OPTIONS'a izin ver

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
      options: '/api/v1/options',
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
app.use('/api/v1/options', optionRoutes);
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

    await db.sequelize.authenticate();
    console.log('✓ Veritabanı bağlantısı başarılı.');

    // Migration'ı çalıştır
    try {
      console.log('🔄 Migration kontrol ediliyor...');
      await migration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        console.log('ℹ️ Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      await db.sequelize.sync({ alter: false });
      console.log('✓ Veritabanı modelleri senkronize edildi.');
    }

    await websocketServer.initialize(server);
    console.log('✓ WebSocket sunucusu başlatıldı.');

    // Order book'ları initialize et
    await marketService.initializeAllOrderBooks();

    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ HTTP Sunucu ${PORT} portunda başlatıldı.`);
      console.log(`✓ WebSocket: wss://api.kahinmarket.com/ws`);
      console.log(`✓ Ortam: ${process.env.NODE_ENV || 'development'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });

  } catch (error) {
    console.error('❌ Sunucu başlatılamadı:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('Sunucu kapatılıyor...');
  await redisClient.quit();
  await db.sequelize.close();
  process.exit(0);
});

startServer();