// src/server.js
console.log('🚀 SERVER.JS BAŞLATILIYOR...');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const db = require('./models');
const redisClient = require('../config/redis');
const websocketServer = require('../config/websocket');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const migration = require('../migrations/add-multiple-choice-support');
const multipleChoiceMigration = require('../migrations/add-multiple-choice-support');
const userProfileMigration = require('../migrations/add-user-profile-fields');
const timestampMigration = require('../migrations/add-timestamps-to-all-tables'); // ⭐ YENİ
const advancedOrdersMigration = require('../migrations/add-advanced-order-types');
const priceHistoryMigration = require('../migrations/add-price-history');
const featuredColumnsMigration = require('../migrations/add-featured-columns');
const fixTimestampDefaultsMigration = require('../migrations/fix-timestamp-defaults');
const fixOrderPriceNullable = require('../migrations/fix-order-price-nullable');

console.log('📦 Route modülleri yükleniyor...');
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
const walletRoutes = require('./routes/wallet.route');
const contractRoutes = require('./routes/contract.route');
const marketService = require('./services/market.service');
const schedulerService = require('./services/scheduler.service');
console.log('✅ Route modülleri yüklendi');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Manuel CORS middleware - Daha güvenilir
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://kahinmarket.com',
    'https://app.kahinmarket.com',
    'https://admin.kahinmarket.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000'
  ];

  // Origin kontrolü
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Preflight request
  if (req.method === 'OPTIONS') {
    console.log(`✅ OPTIONS preflight: ${req.originalUrl} - Origin: ${origin}`);
    return res.status(204).end();
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Ana sayfa
app.get('/', (req, res) => {
  res.json({
    message: 'Kahin Market API v1.0.0',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      markets: '/api/v1/markets',
      shares: '/api/v1/shares',
      orders: '/api/v1/orders',
      transactions: '/api/v1/transactions',
      portfolio: '/api/v1/portfolio',
      trades: '/api/v1/trades',
      options: '/api/v1/options',
      wallet: '/api/v1/wallet',
      admin: '/api/v1/admin',
      contracts: '/api/v1/contracts',
      websocket: 'wss://api.kahinmarket.com/ws'
    }
  });
});

console.log('🔌 API Route\'ları mount ediliyor...');
// API Routes
app.use('/api/v1/auth', authRoutes);
console.log('  ✓ /api/v1/auth');
app.use('/api/v1/users', userRoutes);
console.log('  ✓ /api/v1/users');
app.use('/api/v1/markets', marketRoutes);
console.log('  ✓ /api/v1/markets');
app.use('/api/v1/shares', shareRoutes);
console.log('  ✓ /api/v1/shares');
app.use('/api/v1/orders', orderRoutes);
console.log('  ✓ /api/v1/orders');
app.use('/api/v1/transactions', transactionRoutes);
console.log('  ✓ /api/v1/transactions');
app.use('/api/v1/portfolio', portfolioRoutes);
console.log('  ✓ /api/v1/portfolio');
app.use('/api/v1/trades', tradeRoutes);
console.log('  ✓ /api/v1/trades');
app.use('/api/v1/options', optionRoutes);
console.log('  ✓ /api/v1/options');
app.use('/api/v1/wallet', walletRoutes);
console.log('  ✓ /api/v1/wallet');
app.use('/api/v1/admin', adminRoutes);
console.log('  ✓ /api/v1/admin');
app.use('/api/v1/contracts', contractRoutes);
console.log('  ✓ /api/v1/contracts');

// Dev route (sadece production dışında)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/v1/dev', devRoutes);
  console.log('  ✓ /api/v1/dev (development only)');
}

console.log('✅ Tüm route\'lar mount edildi\n');

// 404 Handler
app.use(notFoundHandler);

// Error Handler
app.use(errorHandler);

async function startServer() {
  try {
    console.log('🔄 Bağlantılar kuruluyor...\n');
    
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('✓ Redis bağlantısı başarıyla kuruldu.');
    } else {
      console.log('✓ Redis zaten bağlı.');
    }

    await db.sequelize.authenticate();
    console.log('✓ Veritabanı bağlantısı başarılı.');

    const userProfileMigration = require('../migrations/add-user-profile-fields');

    // Mevcut migration bölümüne ekleyin (add-multiple-choice-support'tan sonra)
    // 1. Multiple Choice Migration
    try {
      console.log('🔄 Multiple Choice Migration kontrol ediliyor...');
      await multipleChoiceMigration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ Multiple Choice Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ Multiple Choice Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 2. User Profile Migration
    try {
      console.log('🔄 User Profile Migration kontrol ediliyor...');
      await userProfileMigration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ User Profile Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ User Profile Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 3. Timestamp Migration ⭐ YENİ
    try {
      console.log('🔄 Timestamp Migration kontrol ediliyor...');
      await timestampMigration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ Timestamp Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ Timestamp Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 4. Advanced Order Types Migration
    try {
      console.log('🔄 Advanced Order Types Migration kontrol ediliyor...');
      await advancedOrdersMigration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ Advanced Order Types Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ Advanced Order Types Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 5. Price History Migration
    try {
      console.log('🔄 Price History Migration kontrol ediliyor...');
      await priceHistoryMigration.up(db.sequelize.queryInterface, db.Sequelize);
      console.log('✅ Price History Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ Price History Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 6. Featured Columns Migration
    try {
      console.log('🔄 Featured Columns Migration kontrol ediliyor...');
      await featuredColumnsMigration.up(db.sequelize);
      console.log('✅ Featured Columns Migration tamamlandı!');
    } catch (error) {
      if (error.message?.includes('already exists')) {
        console.log('ℹ️ Featured Columns Migration zaten uygulanmış.');
      } else {
        console.error('⚠️ Migration hatası:', error.message);
      }
    }

    // 7. Fix Timestamp Defaults Migration
    try {
      console.log('🔄 Timestamp Defaults Migration kontrol ediliyor...');
      await fixTimestampDefaultsMigration.up(db.sequelize.getQueryInterface(), db.Sequelize);
      console.log('✅ Timestamp Defaults Migration tamamlandı!');
    } catch (error) {
      console.error('⚠️ Migration hatası:', error.message);
    }

    // 8. Fix Order Price Nullable Migration
    try {
      console.log('🔄 Order Price Nullable Migration kontrol ediliyor...');
      await fixOrderPriceNullable.up(db.sequelize.getQueryInterface(), db.Sequelize);
      console.log('✅ Order Price Nullable Migration tamamlandı!');
    } catch (error) {
      console.error('⚠️ Migration hatası:', error.message);
    }

    await websocketServer.initialize(server);
    console.log('✓ WebSocket sunucusu başlatıldı.');

    // Order book'ları initialize et
    await marketService.initializeAllOrderBooks();

    // Initialize scheduler for order expiration and price history
    schedulerService.initialize();
    console.log('✓ Scheduler servisi başlatıldı.');

    server.listen(PORT, () => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ HTTP Sunucu ${PORT} portunda başlatıldı.`);
      console.log(`✓ WebSocket: wss://api.kahinmarket.com/ws`);
      console.log(`✓ Ortam: ${process.env.NODE_ENV || 'development'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

  } catch (error) {
    console.error('❌ Sunucu başlatılamadı:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Sunucu kapatılıyor...');
  await redisClient.quit();
  await db.sequelize.close();
  process.exit(0);
});

startServer();