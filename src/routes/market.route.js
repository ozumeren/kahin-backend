// src/routes/market.route.js
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');
const {
  cacheFeatured,
  cacheTrending,
  cacheCategory,
  cacheSearch,
  cacheSimilar,
  cacheCategories
} = require('../middlewares/cache.middleware');

// Public route'lar - Herkes erişebilir

// Discovery & Filtering Endpoints (must come before :id routes)

// GET /api/v1/markets/featured -> Öne çıkan marketleri getirir
router.get('/featured', cacheFeatured, marketController.getFeaturedMarkets);

// GET /api/v1/markets/trending -> Trend olan marketleri getirir
router.get('/trending', cacheTrending, marketController.getTrendingMarkets);

// GET /api/v1/markets/search -> Market arama
router.get('/search', cacheSearch, marketController.searchMarkets);

// GET /api/v1/markets/categories -> Tüm kategorileri listeler
router.get('/categories', cacheCategories, marketController.getCategories);

// GET /api/v1/markets/category/:category -> Kategoriye göre marketler
router.get('/category/:category', cacheCategory, marketController.getMarketsByCategory);

// GET /api/v1/markets -> Tüm pazarları listeler
router.get('/', marketController.getMarkets);

// GET /api/v1/markets/:id -> Tek bir pazarın detayını getirir
router.get('/:id', marketController.getMarketById);

// GET /api/v1/markets/:id/orderbook -> Order book'u getirir
router.get('/:id/orderbook', marketController.getOrderBook);

// GET /api/v1/markets/:id/similar -> Benzer marketleri getirir
router.get('/:id/similar', cacheSimilar, marketController.getSimilarMarkets);

// NOT: Pazar oluşturma artık admin route'unda
// POST /api/v1/admin/markets

module.exports = router;