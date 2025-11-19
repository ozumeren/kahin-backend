// src/controllers/market.controller.js
const marketService = require('../services/market.service');
const marketDiscoveryService = require('../services/market-discovery.service');
const marketSearchService = require('../services/market-search.service');
const similarityService = require('../services/similarity.service');
const db = require('../models');
const { Trade, MarketOption } = db;

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res, next) {
    try {
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }
      if (req.query.category) {
        filters.category = req.query.category;
      }

      const markets = await marketService.findAll(filters);
      
      // Her market için volume, tradersCount ve prices hesapla
      const marketsWithStats = await Promise.all(
        markets.map(async (market) => {
          const marketData = market.toJSON();
          
          // Market options'ı dahil et
          const options = await MarketOption.findAll({
            where: { market_id: market.id },
            order: [['option_order', 'ASC']],
            raw: true
          });
          
          marketData.options = options || [];
          
          // Volume hesapla (tüm trade'lerin toplamı)
          const trades = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['total'],
            raw: true
          });
          
          marketData.volume = trades.reduce((sum, trade) => {
            return sum + parseFloat(trade.total || 0);
          }, 0).toFixed(2);
          
          // Unique trader count hesapla
          const uniqueTraders = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['buyerId', 'sellerId'],
            raw: true
          });
          
          const traderSet = new Set();
          uniqueTraders.forEach(trade => {
            traderSet.add(trade.buyerId);
            traderSet.add(trade.sellerId);
          });
          
          marketData.tradersCount = traderSet.size;
          
          // Order book'tan fiyatları al (sadece binary marketler için)
          if (market.market_type === 'binary') {
            try {
              const orderBook = await marketService.getOrderBook(market.id);
              marketData.yesMidPrice = orderBook.yesMidPrice || '0.50';
              marketData.noMidPrice = orderBook.noMidPrice || '0.50';
            } catch (error) {
              marketData.yesMidPrice = '0.50';
              marketData.noMidPrice = '0.50';
            }
          }
          
          return marketData;
        })
      );

      res.status(200).json({
        success: true,
        count: marketsWithStats.length,
        data: marketsWithStats
      });
    } catch (error) {
      next(error);
    }
  }

  // Tek bir pazarın detayını getir
  // Tek bir pazarın detayını getir
async getMarketById(req, res, next) {
  try {
    const { id } = req.params;
    const market = await marketService.findById(id);

    if (!market) {
      return res.status(404).json({
        success: false,
        message: 'Pazar bulunamadı'
      });
    }

    const marketData = market.toJSON();

    // Options'ları dahil et
    const options = await MarketOption.findAll({
      where: { market_id: id },
      order: [['option_order', 'ASC']],
      raw: true  // ✅ raw: true ekleyin
    });
    
    // ✅ Options'ı düzgün formatta ekle
    marketData.options = options.map(opt => ({
      id: opt.id,
      market_id: opt.market_id,
      option_text: opt.option_text,
      option_image_url: opt.option_image_url,
      option_order: opt.option_order
    }));

    // Volume hesapla
    const trades = await Trade.findAll({
      where: { marketId: id },
      attributes: ['total'],
      raw: true
    });
    
    marketData.volume = trades.reduce((sum, trade) => {
      return sum + parseFloat(trade.total || 0);
    }, 0).toFixed(2);

    // Unique trader count hesapla
    const uniqueTraders = await Trade.findAll({
      where: { marketId: id },
      attributes: ['buyerId', 'sellerId'],
      raw: true
    });
    
    const traderSet = new Set();
    uniqueTraders.forEach(trade => {
      traderSet.add(trade.buyerId);
      traderSet.add(trade.sellerId);
    });
    
    marketData.tradersCount = traderSet.size;

    // Binary market için order book
    if (market.market_type === 'binary') {
      try {
        const orderBook = await marketService.getOrderBook(id);
        marketData.orderBook = orderBook;
      } catch (error) {
        console.error('Order book hatası:', error);
        marketData.orderBook = null;
      }
    }

    // ✅ Response'u göndermeden önce validate et
    const responseJson = JSON.stringify({
      success: true,
      data: marketData
    });

    res.status(200).json({
      success: true,
      data: marketData
    });
    
  } catch (error) {
    console.error('getMarketById error:', error);
    next(error);
  }
}

  // Order book'u getir
  async getOrderBook(req, res, next) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);

      if (!market) {
        return res.status(404).json({
          success: false,
          message: 'Pazar bulunamadı'
        });
      }

      const orderBook = await marketService.getOrderBook(id);

      res.status(200).json({
        success: true,
        data: orderBook
      });
    } catch (error) {
      next(error);
    }
  }

  // Featured marketleri getir
  async getFeaturedMarkets(req, res, next) {
    try {
      const { limit = 10, category } = req.query;

      const markets = await marketDiscoveryService.getFeaturedMarkets({
        limit: parseInt(limit),
        category
      });

      res.status(200).json({
        success: true,
        data: {
          markets,
          count: markets.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Trending marketleri getir
  async getTrendingMarkets(req, res, next) {
    try {
      const { timeframe = '24h', limit = 20, category } = req.query;

      const markets = await marketDiscoveryService.getTrendingMarkets({
        timeframe,
        limit: parseInt(limit),
        category
      });

      res.status(200).json({
        success: true,
        data: {
          markets,
          count: markets.length,
          timeframe
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Kategoriye göre marketleri getir
  async getMarketsByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const {
        status,
        sortBy = 'volume',
        sortOrder = 'desc',
        limit = 20,
        offset = 0,
        minVolume,
        maxPrice
      } = req.query;

      const result = await marketDiscoveryService.getMarketsByCategory(category, {
        status,
        sortBy,
        sortOrder,
        limit: parseInt(limit),
        offset: parseInt(offset),
        minVolume,
        maxPrice
      });

      res.status(200).json({
        success: true,
        data: {
          category,
          ...result
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Market arama
  async searchMarkets(req, res, next) {
    try {
      const {
        q,
        category,
        status,
        minVolume,
        maxVolume,
        minPrice,
        maxPrice,
        closingBefore,
        closingAfter,
        hasImage,
        sortBy = 'relevance',
        limit = 20,
        offset = 0
      } = req.query;

      const result = await marketSearchService.searchMarkets({
        q,
        category,
        status,
        minVolume,
        maxVolume,
        minPrice,
        maxPrice,
        closingBefore,
        closingAfter,
        hasImage,
        sortBy,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Benzer marketleri getir
  async getSimilarMarkets(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 5, algorithm = 'hybrid' } = req.query;

      const result = await similarityService.getSimilarMarkets(id, {
        limit: parseInt(limit),
        algorithm
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Tüm kategorileri listele
  async getCategories(req, res, next) {
    try {
      const categories = await marketDiscoveryService.getCategories();

      res.status(200).json({
        success: true,
        data: {
          categories
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MarketController();