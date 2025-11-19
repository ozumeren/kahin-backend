// src/services/similarity.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Trade } = db;
const { extractKeywords, cosineSimilarity } = require('../utils/text-similarity');

class SimilarityService {
  /**
   * Get similar markets
   */
  async getSimilarMarkets(marketId, options = {}) {
    const { limit = 5, algorithm = 'hybrid' } = options;

    // Get source market
    const sourceMarket = await Market.findByPk(marketId);
    if (!sourceMarket) {
      throw new Error('Market not found');
    }

    // Get all active markets except source
    const candidateMarkets = await Market.findAll({
      where: {
        id: { [Op.ne]: marketId },
        status: 'open'
      }
    });

    // Calculate similarity scores based on algorithm
    let similarMarkets = [];

    switch (algorithm) {
      case 'category':
        similarMarkets = await this.categoryBasedSimilarity(sourceMarket, candidateMarkets);
        break;
      case 'content':
        similarMarkets = await this.contentBasedSimilarity(sourceMarket, candidateMarkets);
        break;
      case 'collaborative':
        similarMarkets = await this.collaborativeFiltering(sourceMarket, candidateMarkets);
        break;
      case 'hybrid':
      default:
        similarMarkets = await this.hybridSimilarity(sourceMarket, candidateMarkets);
        break;
    }

    // Sort by similarity score and limit
    similarMarkets.sort((a, b) => b.similarity_score - a.similarity_score);
    const topSimilar = similarMarkets.slice(0, limit);

    // Enrich with stats
    const enrichedMarkets = await Promise.all(
      topSimilar.map(async (market) => {
        const stats = await this.getMarketStats(market.id);
        return {
          ...market,
          stats: {
            volume: stats.volume,
            yes_price: stats.yes_price
          }
        };
      })
    );

    return {
      source_market: {
        id: sourceMarket.id,
        title: sourceMarket.title,
        category: sourceMarket.category
      },
      similar_markets: enrichedMarkets,
      count: enrichedMarkets.length,
      algorithm_used: algorithm
    };
  }

  /**
   * Category-based similarity (simple)
   */
  async categoryBasedSimilarity(sourceMarket, candidates) {
    const results = [];

    for (const market of candidates) {
      const marketData = market.toJSON();
      let score = 0;
      const reasons = [];

      // Same category = base score
      if (market.category === sourceMarket.category) {
        score += 30;
        reasons.push('same_category');
      }

      // Get volume for sorting
      const stats = await this.getMarketStats(market.id);
      score += Math.min(30, stats.volume / 1000); // Volume bonus

      // Same timeframe bonus
      const sourceDays = this.getDaysUntilClosing(sourceMarket.closing_date);
      const marketDays = this.getDaysUntilClosing(market.closing_date);
      if (Math.abs(sourceDays - marketDays) < 30) {
        score += 10;
        reasons.push('same_timeframe');
      }

      results.push({
        id: marketData.id,
        title: marketData.title,
        category: marketData.category,
        similarity_score: Math.round(score * 10) / 10,
        similarity_reasons: reasons
      });
    }

    return results;
  }

  /**
   * Content-based similarity using keywords
   */
  async contentBasedSimilarity(sourceMarket, candidates) {
    const sourceKeywords = extractKeywords(
      `${sourceMarket.title} ${sourceMarket.description || ''}`
    );

    const results = [];

    for (const market of candidates) {
      const marketData = market.toJSON();
      const marketKeywords = extractKeywords(
        `${market.title} ${market.description || ''}`
      );

      // Calculate cosine similarity
      const contentScore = cosineSimilarity(sourceKeywords, marketKeywords);

      const reasons = [];
      if (contentScore > 30) {
        reasons.push('related_keywords');
      }
      if (market.category === sourceMarket.category) {
        reasons.push('same_category');
      }

      // Check for common topics
      const commonKeywords = sourceKeywords.filter(kw => marketKeywords.includes(kw));
      if (commonKeywords.length > 2) {
        reasons.push('related_topics');
      }

      const score = contentScore * 0.7 + (market.category === sourceMarket.category ? 30 : 0);

      results.push({
        id: marketData.id,
        title: marketData.title,
        category: marketData.category,
        similarity_score: Math.round(score * 10) / 10,
        similarity_reasons: reasons
      });
    }

    return results;
  }

  /**
   * Collaborative filtering based on user overlap
   */
  async collaborativeFiltering(sourceMarket, candidates) {
    // Get traders who traded in source market
    const sourceTrades = await Trade.findAll({
      where: { marketId: sourceMarket.id },
      attributes: ['buyerId', 'sellerId'],
      raw: true
    });

    const sourceTraders = new Set();
    sourceTrades.forEach(trade => {
      if (trade.buyerId) sourceTraders.add(trade.buyerId);
      if (trade.sellerId) sourceTraders.add(trade.sellerId);
    });

    const results = [];

    for (const market of candidates) {
      const marketData = market.toJSON();

      // Get traders for this market
      const marketTrades = await Trade.findAll({
        where: { marketId: market.id },
        attributes: ['buyerId', 'sellerId'],
        raw: true
      });

      const marketTraders = new Set();
      marketTrades.forEach(trade => {
        if (trade.buyerId) marketTraders.add(trade.buyerId);
        if (trade.sellerId) marketTraders.add(trade.sellerId);
      });

      // Calculate user overlap
      let overlap = 0;
      for (const trader of sourceTraders) {
        if (marketTraders.has(trader)) overlap++;
      }

      const overlapRatio = sourceTraders.size > 0
        ? (overlap / sourceTraders.size) * 100
        : 0;

      const reasons = [];
      if (overlapRatio > 10) {
        reasons.push('similar_traders');
      }
      if (market.category === sourceMarket.category) {
        reasons.push('same_category');
      }

      const score = overlapRatio * 0.6 + (market.category === sourceMarket.category ? 30 : 0);

      results.push({
        id: marketData.id,
        title: marketData.title,
        category: marketData.category,
        similarity_score: Math.round(score * 10) / 10,
        similarity_reasons: reasons
      });
    }

    return results;
  }

  /**
   * Hybrid similarity combining all methods
   */
  async hybridSimilarity(sourceMarket, candidates) {
    const sourceKeywords = extractKeywords(
      `${sourceMarket.title} ${sourceMarket.description || ''}`
    );

    // Get source traders
    const sourceTrades = await Trade.findAll({
      where: { marketId: sourceMarket.id },
      attributes: ['buyerId', 'sellerId'],
      raw: true
    });

    const sourceTraders = new Set();
    sourceTrades.forEach(trade => {
      if (trade.buyerId) sourceTraders.add(trade.buyerId);
      if (trade.sellerId) sourceTraders.add(trade.sellerId);
    });

    const results = [];

    for (const market of candidates) {
      const marketData = market.toJSON();
      const reasons = [];

      // 1. Category match (30%)
      const categoryScore = market.category === sourceMarket.category ? 30 : 0;
      if (categoryScore > 0) reasons.push('same_category');

      // 2. Content similarity (40%)
      const marketKeywords = extractKeywords(
        `${market.title} ${market.description || ''}`
      );
      const contentScore = cosineSimilarity(sourceKeywords, marketKeywords) * 0.4;
      if (contentScore > 10) reasons.push('related_keywords');

      // 3. User overlap (30%)
      const marketTrades = await Trade.findAll({
        where: { marketId: market.id },
        attributes: ['buyerId', 'sellerId'],
        raw: true
      });

      const marketTraders = new Set();
      marketTrades.forEach(trade => {
        if (trade.buyerId) marketTraders.add(trade.buyerId);
        if (trade.sellerId) marketTraders.add(trade.sellerId);
      });

      let overlap = 0;
      for (const trader of sourceTraders) {
        if (marketTraders.has(trader)) overlap++;
      }

      const overlapScore = sourceTraders.size > 0
        ? (overlap / sourceTraders.size) * 30
        : 0;
      if (overlapScore > 5) reasons.push('similar_traders');

      // Calculate total score
      const totalScore = (categoryScore * 0.3) + contentScore + (overlapScore * 0.3);

      results.push({
        id: marketData.id,
        title: marketData.title,
        category: marketData.category,
        similarity_score: Math.round(totalScore * 10) / 10,
        similarity_reasons: reasons
      });
    }

    return results;
  }

  /**
   * Get days until closing
   */
  getDaysUntilClosing(closingDate) {
    if (!closingDate) return 365;
    const now = new Date();
    const closing = new Date(closingDate);
    return Math.ceil((closing - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get market statistics
   */
  async getMarketStats(marketId) {
    const trades = await Trade.findAll({
      where: { marketId },
      attributes: ['total', 'price', 'outcome'],
      raw: true
    });

    const volume = trades.reduce((sum, trade) => sum + parseFloat(trade.total || 0), 0);

    const yesTrades = trades.filter(t => t.outcome === true);
    const yesPrice = yesTrades.length > 0
      ? yesTrades.reduce((sum, t) => sum + parseFloat(t.price), 0) / yesTrades.length
      : 50;

    return {
      volume: Math.round(volume * 100) / 100,
      yes_price: Math.round(yesPrice * 10) / 10
    };
  }
}

module.exports = new SimilarityService();
