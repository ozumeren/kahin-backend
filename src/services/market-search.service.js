// src/services/market-search.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Trade } = db;
const {
  fuzzyMatch,
  highlightText,
  calculateSearchRelevance,
  generateSuggestions
} = require('../utils/text-similarity');

class MarketSearchService {
  /**
   * Search markets with advanced filtering
   */
  async searchMarkets(options = {}) {
    const {
      q = '',
      category = null,
      status = null,
      minVolume = null,
      maxVolume = null,
      minPrice = null,
      maxPrice = null,
      closingBefore = null,
      closingAfter = null,
      hasImage = null,
      sortBy = 'relevance',
      limit = 20,
      offset = 0
    } = options;

    // Build base where clause
    const whereClause = {};

    if (category) {
      whereClause.category = category;
    }

    if (status) {
      whereClause.status = status;
    }

    if (closingBefore) {
      whereClause.closing_date = {
        ...whereClause.closing_date,
        [Op.lte]: new Date(closingBefore)
      };
    }

    if (closingAfter) {
      whereClause.closing_date = {
        ...whereClause.closing_date,
        [Op.gte]: new Date(closingAfter)
      };
    }

    if (hasImage === 'true') {
      whereClause.image_url = {
        [Op.ne]: null
      };
    }

    // Get all markets matching filters (we'll filter by text in memory for better fuzzy matching)
    const markets = await Market.findAll({
      where: whereClause
    });

    // Enrich with stats and calculate relevance
    const enrichedMarkets = await Promise.all(
      markets.map(async (market) => {
        const marketData = market.toJSON();
        const stats = await this.getMarketStats(market.id);

        // Calculate relevance if there's a search query
        let relevanceScore = 0;
        let matchFields = [];
        let highlightedTitle = marketData.title;

        if (q) {
          relevanceScore = calculateSearchRelevance({
            ...marketData,
            volume: stats.volume
          }, q);

          // Determine match fields
          if (fuzzyMatch(marketData.title, q) > 50) {
            matchFields.push('title');
          }
          if (fuzzyMatch(marketData.description, q) > 30) {
            matchFields.push('description');
          }
          if (marketData.tags && marketData.tags.some(tag => tag.toLowerCase().includes(q.toLowerCase()))) {
            matchFields.push('tags');
          }

          // Highlight title
          highlightedTitle = highlightText(marketData.title, q);
        }

        return {
          id: marketData.id,
          title: marketData.title,
          description: marketData.description,
          category: marketData.category,
          status: marketData.status,
          closing_date: marketData.closing_date,
          image_url: marketData.image_url,
          relevance_score: Math.round(relevanceScore * 10) / 10,
          match_fields: matchFields,
          highlighted_title: highlightedTitle,
          stats: {
            volume: stats.volume,
            yes_price: stats.yes_price,
            traders_count: stats.traders_count
          }
        };
      })
    );

    // Filter by text search (if query exists)
    let filteredMarkets = enrichedMarkets;
    if (q) {
      filteredMarkets = enrichedMarkets.filter(m => m.relevance_score > 20);
    }

    // Filter by volume
    if (minVolume) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.volume >= parseFloat(minVolume));
    }
    if (maxVolume) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.volume <= parseFloat(maxVolume));
    }

    // Filter by price
    if (minPrice) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.yes_price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      filteredMarkets = filteredMarkets.filter(m => m.stats.yes_price <= parseFloat(maxPrice));
    }

    // Sort results
    filteredMarkets.sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return b.relevance_score - a.relevance_score;
        case 'volume':
          return b.stats.volume - a.stats.volume;
        case 'recent':
          return new Date(b.createdAt) - new Date(a.createdAt);
        default:
          return b.relevance_score - a.relevance_score;
      }
    });

    // Generate search suggestions
    const suggestions = q ? generateSuggestions(q, markets) : [];

    // Paginate
    const total = filteredMarkets.length;
    const paginatedResults = filteredMarkets.slice(offset, offset + limit);

    return {
      query: q,
      results: paginatedResults,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total
      },
      filters_applied: {
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
        sortBy
      },
      search_suggestions: suggestions
    };
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
      no_price: Math.round(noPrice * 10) / 10
    };
  }

  /**
   * Get popular search terms (would need to be tracked separately)
   */
  async getPopularSearches(limit = 5) {
    // Placeholder - would need search tracking to implement fully
    return [
      'bitcoin',
      'seçim',
      'şampiyonluk',
      'faiz',
      'dolar'
    ].slice(0, limit);
  }

  /**
   * Auto-complete search query
   */
  async autocomplete(query, limit = 5) {
    if (!query || query.length < 2) return [];

    const markets = await Market.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } }
        ],
        status: 'open'
      },
      attributes: ['title'],
      limit: limit * 2
    });

    const suggestions = generateSuggestions(query, markets);
    return suggestions.slice(0, limit);
  }
}

module.exports = new MarketSearchService();
