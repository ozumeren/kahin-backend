// src/services/market-discovery.service.js
const { Op, Sequelize } = require('sequelize');
const db = require('../models');
const { Market, Trade, MarketOption } = db;
const { calculateFeaturedScore, getFeaturedReason } = require('../utils/scoring-algorithm');
const {
  calculateTrendingScore,
  getTrendingIndicators,
  getTimeframeRange,
  calculate24hChange,
  aggregateTradeData
} = require('../utils/trend-calculator');

/**
 * Supported categories
 */
const CATEGORIES = {
  POLITICS: 'politics',
  SPORTS: 'sports',
  CRYPTO: 'crypto',
  ECONOMY: 'economy',
  ENTERTAINMENT: 'entertainment',
  TECHNOLOGY: 'technology',
  SCIENCE: 'science',
  HEALTH: 'health',
  ENVIRONMENT: 'environment',
  OTHER: 'other'
};

/**
 * Category metadata
 */
const CATEGORY_METADATA = {
  politics: { name: 'Siyaset', icon: '🏛️', description: 'Seçimler, politika ve hükümet' },
  sports: { name: 'Spor', icon: '⚽', description: 'Spor etkinlikleri ve maçlar' },
  crypto: { name: 'Kripto', icon: '₿', description: 'Kripto paralar ve blockchain' },
  economy: { name: 'Ekonomi', icon: '📈', description: 'Ekonomi ve finans' },
  entertainment: { name: 'Eğlence', icon: '🎬', description: 'Film, müzik ve TV' },
  technology: { name: 'Teknoloji', icon: '💻', description: 'Teknoloji ve yenilik' },
  science: { name: 'Bilim', icon: '🔬', description: 'Bilimsel gelişmeler' },
  health: { name: 'Sağlık', icon: '🏥', description: 'Sağlık ve tıp' },
  environment: { name: 'Çevre', icon: '🌍', description: 'Çevre ve iklim' },
  other: { name: 'Diğer', icon: '📋', description: 'Diğer konular' }
};

class MarketDiscoveryService {
  /**
   * Get featured markets
   */
  async getFeaturedMarkets(options = {}) {
    const { limit = 10, category = null } = options;

    // Build where clause
    const whereClause = { status: 'open' };
    if (category && CATEGORIES[category.toUpperCase()]) {
      whereClause.category = category;
    }

    // Get markets
    const markets = await Market.findAll({
      where: whereClause,
      order: [
        ['featured', 'DESC'],
        ['featured_weight', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: limit * 2 // Get extra to score and sort
    });

    // Enrich with stats and calculate featured scores
    const enrichedMarkets = await Promise.all(
      markets.map(async (market) => {
        const marketData = market.toJSON();
        const stats = await this.getMarketStats(market.id);

        return {
          ...marketData,
          stats,
          volume: stats.volume,
          tradersCount: stats.traders_count,
          featured_score: calculateFeaturedScore({
            ...marketData,
            volume: stats.volume,
            tradersCount: stats.traders_count
          }),
          featured_reason: getFeaturedReason({
            ...marketData,
            volume: stats.volume,
            tradersCount: stats.traders_count
          }),
          featured_since: marketData.featured_at
        };
      })
    );

    // Sort by featured score and limit
    enrichedMarkets.sort((a, b) => {
      // Admin featured first
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b.featured_score - a.featured_score;
    });

    return enrichedMarkets.slice(0, limit);
  }

  /**
   * Get trending markets
   */
  async getTrendingMarkets(options = {}) {
    const { timeframe = '24h', limit = 20, category = null } = options;

    // Build where clause
    const whereClause = { status: 'open' };
    if (category && CATEGORIES[category.toUpperCase()]) {
      whereClause.category = category;
    }

    // Get markets
    const markets = await Market.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: 100 // Get more to calculate trending
    });

    // Calculate trending scores
    const { start, end } = getTimeframeRange(timeframe);
    const previousStart = new Date(start.getTime() - (end - start));

    const trendingMarkets = await Promise.all(
      markets.map(async (market) => {
        const marketData = market.toJSON();

        // Get current period stats
        const currentStats = await this.getMarketStatsForPeriod(market.id, start, end);
        // Get previous period stats for comparison
        const previousStats = await this.getMarketStatsForPeriod(market.id, previousStart, start);

        // Calculate changes
        const volumeChange = calculate24hChange(currentStats.volume, previousStats.volume);
        const tradersChange = calculate24hChange(currentStats.traders_count, previousStats.traders_count);

        // Calculate price momentum (simple version)
        const priceMomentum = currentStats.yes_price > 50 ?
          (currentStats.yes_price - 50) : (50 - currentStats.yes_price);

        const trendStats = {
          volumeChange,
          traderGrowth: tradersChange,
          priceMomentum,
          engagementRate: currentStats.traders_count > 0 ?
            (currentStats.trade_count / currentStats.traders_count) * 10 : 0
        };

        const trendScore = calculateTrendingScore(trendStats, timeframe);
        const indicators = getTrendingIndicators(trendStats);

        return {
          id: marketData.id,
          title: marketData.title,
          description: marketData.description,
          category: marketData.category,
          status: marketData.status,
          closing_date: marketData.closing_date,
          image_url: marketData.image_url,
          stats: {
            volume: currentStats.volume,
            volume_change_24h: volumeChange,
            traders_count: currentStats.traders_count,
            traders_change_24h: tradersChange,
            price_momentum: Math.round(priceMomentum * 10) / 10,
            trend_score: trendScore,
            yes_price: currentStats.yes_price,
            no_price: currentStats.no_price
          },
          trending_indicators: indicators
        };
      })
    );

    // Sort by trend score
    trendingMarkets.sort((a, b) => b.stats.trend_score - a.stats.trend_score);

    return trendingMarkets.slice(0, limit);
  }

  /**
   * Get markets by category with filtering and sorting
   */
  async getMarketsByCategory(category, options = {}) {
    const {
      status = null,
      sortBy = 'volume',
      sortOrder = 'desc',
      limit = 20,
      offset = 0,
      minVolume = null,
      maxPrice = null
    } = options;

    // Validate category
    if (!CATEGORIES[category.toUpperCase()] && category !== 'all') {
      throw new Error(`Invalid category: ${category}`);
    }

    // Build where clause
    const whereClause = {};
    if (category !== 'all') {
      whereClause.category = category;
    }
    if (status) {
      whereClause.status = status;
    }

    // Get all markets in category
    const markets = await Market.findAll({
      where: whereClause
    });

    // Enrich with stats
    const enrichedMarkets = await Promise.all(
      markets.map(async (market) => {
        const marketData = market.toJSON();
        const stats = await this.getMarketStats(market.id);

        return {
          ...marketData,
          stats
        };
      })
    );

    // Apply filters
    let filteredMarkets = enrichedMarkets;

    if (minVolume) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.volume >= parseFloat(minVolume));
    }
    if (maxPrice) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.yes_price <= parseFloat(maxPrice));
    }

    // Sort
    const sortField = this.getSortField(sortBy);
    filteredMarkets.sort((a, b) => {
      const aVal = this.getNestedValue(a, sortField);
      const bVal = this.getNestedValue(b, sortField);

      if (sortOrder === 'desc') {
        return bVal - aVal;
      }
      return aVal - bVal;
    });

    // Paginate
    const total = filteredMarkets.length;
    const paginatedMarkets = filteredMarkets.slice(offset, offset + limit);

    return {
      markets: paginatedMarkets,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
        total_pages: Math.ceil(total / limit)
      },
      filters_applied: {
        status,
        sortBy,
        sortOrder,
        minVolume,
        maxPrice
      }
    };
  }

  /**
   * Get all categories with stats
   */
  async getCategories() {
    const categories = [];

    for (const [key, value] of Object.entries(CATEGORIES)) {
      const metadata = CATEGORY_METADATA[value] || {};

      // Get stats for category
      const totalMarkets = await Market.count({
        where: { category: value }
      });

      const activeMarkets = await Market.count({
        where: { category: value, status: 'open' }
      });

      // Get volume and traders for category
      const markets = await Market.findAll({
        where: { category: value, status: 'open' },
        attributes: ['id']
      });

      let totalVolume = 0;
      const allTraders = new Set();

      for (const market of markets) {
        const trades = await Trade.findAll({
          where: { marketId: market.id },
          attributes: ['total', 'buyerId', 'sellerId'],
          raw: true
        });

        trades.forEach(trade => {
          totalVolume += parseFloat(trade.total || 0);
          if (trade.buyerId) allTraders.add(trade.buyerId);
          if (trade.sellerId) allTraders.add(trade.sellerId);
        });
      }

      // Determine if trending (simple heuristic)
      const trending = activeMarkets > 5 && totalVolume > 50000;

      categories.push({
        id: value,
        name: metadata.name || value,
        slug: value,
        icon: metadata.icon || '📋',
        description: metadata.description || '',
        stats: {
          total_markets: totalMarkets,
          active_markets: activeMarkets,
          total_volume: Math.round(totalVolume * 100) / 100,
          total_traders: allTraders.size
        },
        trending
      });
    }

    // Sort by active markets
    categories.sort((a, b) => b.stats.active_markets - a.stats.active_markets);

    return categories;
  }

  /**
   * Get market statistics
   */
  async getMarketStats(marketId) {
    const trades = await Trade.findAll({
      where: { marketId },
      attributes: ['total', 'buyerId', 'sellerId', 'price', 'outcome'],
      raw: true
    });

    const volume = trades.reduce((sum, trade) => sum + parseFloat(trade.total || 0), 0);

    const traderSet = new Set();
    trades.forEach(trade => {
      if (trade.buyerId) traderSet.add(trade.buyerId);
      if (trade.sellerId) traderSet.add(trade.sellerId);
    });

    // Calculate average prices
    const yesTrades = trades.filter(t => t.outcome === true);
    const noTrades = trades.filter(t => t.outcome === false);

    const yesPrice = yesTrades.length > 0
      ? yesTrades.reduce((sum, t) => sum + parseFloat(t.price), 0) / yesTrades.length
      : 50;
    const noPrice = noTrades.length > 0
      ? noTrades.reduce((sum, t) => sum + parseFloat(t.price), 0) / noTrades.length
      : 50;

    return {
      volume: Math.round(volume * 100) / 100,
      traders_count: traderSet.size,
      yes_price: Math.round(yesPrice * 10) / 10,
      no_price: Math.round(noPrice * 10) / 10,
      trade_count: trades.length,
      liquidity_score: Math.min(100, Math.round(volume / 1000))
    };
  }

  /**
   * Get market stats for a specific time period
   */
  async getMarketStatsForPeriod(marketId, start, end) {
    const trades = await Trade.findAll({
      where: {
        marketId,
        createdAt: {
          [Op.between]: [start, end]
        }
      },
      attributes: ['total', 'buyerId', 'sellerId', 'price', 'outcome'],
      raw: true
    });

    const volume = trades.reduce((sum, trade) => sum + parseFloat(trade.total || 0), 0);

    const traderSet = new Set();
    trades.forEach(trade => {
      if (trade.buyerId) traderSet.add(trade.buyerId);
      if (trade.sellerId) traderSet.add(trade.sellerId);
    });

    // Calculate latest prices
    const yesTrades = trades.filter(t => t.outcome === true);
    const noTrades = trades.filter(t => t.outcome === false);

    const yesPrice = yesTrades.length > 0
      ? yesTrades[yesTrades.length - 1].price
      : 50;
    const noPrice = noTrades.length > 0
      ? noTrades[noTrades.length - 1].price
      : 50;

    return {
      volume: Math.round(volume * 100) / 100,
      traders_count: traderSet.size,
      yes_price: parseFloat(yesPrice),
      no_price: parseFloat(noPrice),
      trade_count: trades.length
    };
  }

  /**
   * Get sort field mapping
   */
  getSortField(sortBy) {
    const mapping = {
      volume: 'stats.volume',
      traders: 'stats.traders_count',
      liquidity: 'stats.liquidity_score',
      closing_date: 'closing_date',
      created_at: 'createdAt',
      price_change: 'stats.yes_price'
    };
    return mapping[sortBy] || 'stats.volume';
  }

  /**
   * Get nested object value by path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : 0;
    }, obj);
  }

  /**
   * Increment view count for market
   */
  async incrementViewCount(marketId) {
    await Market.increment('view_count', {
      where: { id: marketId }
    });
  }
}

module.exports = new MarketDiscoveryService();
module.exports.CATEGORIES = CATEGORIES;
module.exports.CATEGORY_METADATA = CATEGORY_METADATA;
