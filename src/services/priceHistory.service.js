// src/services/priceHistory.service.js
// Service for managing OHLCV price history data

const { Op } = require('sequelize');
const db = require('../models');
const { PriceHistory, Market, sequelize } = db;
const redisClient = require('../../config/redis');

class PriceHistoryService {
  constructor() {
    // In-memory buffer for current candles (before persisting)
    this.candleBuffer = new Map();
  }

  /**
   * Get interval duration in milliseconds
   */
  getIntervalMs(interval) {
    const intervals = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return intervals[interval] || intervals['1h'];
  }

  /**
   * Get candle timestamp (floor to interval)
   */
  getCandleTimestamp(date, interval) {
    const ms = this.getIntervalMs(interval);
    return new Date(Math.floor(date.getTime() / ms) * ms);
  }

  /**
   * Generate buffer key for a candle
   */
  getBufferKey(marketId, outcome, interval, timestamp) {
    return `${marketId}:${outcome}:${interval}:${timestamp.toISOString()}`;
  }

  /**
   * Record a trade and update price history
   * Called after each successful trade
   */
  async recordTrade(marketId, outcome, price, quantity, timestamp = new Date()) {
    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];

    for (const interval of intervals) {
      await this.updateCandle(marketId, outcome, interval, price, quantity, timestamp);
    }

    // Update Redis cache for real-time price
    await this.updateCurrentPrice(marketId, outcome, price);
  }

  /**
   * Update or create a candle for a specific interval
   */
  async updateCandle(marketId, outcome, interval, price, quantity, timestamp) {
    const candleTimestamp = this.getCandleTimestamp(timestamp, interval);
    const bufferKey = this.getBufferKey(marketId, outcome, interval, candleTimestamp);
    const priceNum = parseFloat(price);

    // Check buffer first
    let candle = this.candleBuffer.get(bufferKey);

    if (!candle) {
      // Check database
      candle = await PriceHistory.findOne({
        where: {
          marketId,
          outcome,
          interval,
          timestamp: candleTimestamp
        }
      });

      if (candle) {
        // Convert to buffer format
        candle = {
          id: candle.id,
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
          volume: candle.volume,
          trade_count: candle.trade_count,
          totalValue: parseFloat(candle.vwap) * candle.volume || 0
        };
      }
    }

    if (candle) {
      // Update existing candle
      candle.high = Math.max(candle.high, priceNum);
      candle.low = Math.min(candle.low, priceNum);
      candle.close = priceNum;
      candle.volume += quantity;
      candle.trade_count += 1;
      candle.totalValue += priceNum * quantity;
    } else {
      // Create new candle
      candle = {
        open: priceNum,
        high: priceNum,
        low: priceNum,
        close: priceNum,
        volume: quantity,
        trade_count: 1,
        totalValue: priceNum * quantity
      };
    }

    // Store in buffer
    this.candleBuffer.set(bufferKey, candle);

    // Persist immediately for larger intervals, buffer for smaller ones
    if (interval === '1h' || interval === '4h' || interval === '1d') {
      await this.persistCandle(marketId, outcome, interval, candleTimestamp, candle);
    }
  }

  /**
   * Persist candle to database
   */
  async persistCandle(marketId, outcome, interval, timestamp, candle) {
    const vwap = candle.volume > 0 ? candle.totalValue / candle.volume : candle.close;

    await PriceHistory.upsert({
      id: candle.id,
      marketId,
      outcome,
      interval,
      timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      trade_count: candle.trade_count,
      vwap
    });
  }

  /**
   * Flush all buffered candles to database
   * Should be called periodically (e.g., every minute)
   */
  async flushBuffer() {
    const entries = Array.from(this.candleBuffer.entries());

    for (const [key, candle] of entries) {
      const [marketId, outcome, interval, timestampStr] = key.split(':');
      const timestamp = new Date(timestampStr);

      await this.persistCandle(
        marketId,
        outcome === 'true',
        interval,
        timestamp,
        candle
      );
    }

    // Clear buffer after persistence
    this.candleBuffer.clear();
    console.log(`📊 Flushed ${entries.length} candles to database`);
  }

  /**
   * Update current price in Redis for real-time access
   */
  async updateCurrentPrice(marketId, outcome, price) {
    const key = `price:current:${marketId}:${outcome}`;
    await redisClient.set(key, price.toString(), { EX: 3600 }); // 1 hour TTL
  }

  /**
   * Get current price from Redis
   */
  async getCurrentPrice(marketId, outcome) {
    const key = `price:current:${marketId}:${outcome}`;
    const price = await redisClient.get(key);
    return price ? parseFloat(price) : null;
  }

  /**
   * Get price history for a market
   */
  async getPriceHistory(marketId, outcome, interval = '1h', options = {}) {
    const {
      startTime,
      endTime = new Date(),
      limit = 100
    } = options;

    const where = {
      marketId,
      outcome,
      interval
    };

    if (startTime) {
      where.timestamp = { [Op.gte]: startTime };
    }
    if (endTime) {
      where.timestamp = { ...where.timestamp, [Op.lte]: endTime };
    }

    const candles = await PriceHistory.findAll({
      where,
      order: [['timestamp', 'ASC']],
      limit,
      raw: true
    });

    return candles.map(c => ({
      timestamp: c.timestamp,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: c.volume,
      tradeCount: c.trade_count,
      vwap: c.vwap ? parseFloat(c.vwap) : null
    }));
  }

  /**
   * Get latest candle for a market
   */
  async getLatestCandle(marketId, outcome, interval = '1h') {
    const candle = await PriceHistory.findOne({
      where: { marketId, outcome, interval },
      order: [['timestamp', 'DESC']],
      raw: true
    });

    if (!candle) return null;

    return {
      timestamp: candle.timestamp,
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: candle.volume,
      tradeCount: candle.trade_count,
      vwap: candle.vwap ? parseFloat(candle.vwap) : null
    };
  }

  /**
   * Get 24h price change statistics
   */
  async get24hStats(marketId, outcome) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const candles = await PriceHistory.findAll({
      where: {
        marketId,
        outcome,
        interval: '1h',
        timestamp: { [Op.gte]: yesterday }
      },
      order: [['timestamp', 'ASC']],
      raw: true
    });

    if (candles.length === 0) {
      return null;
    }

    const firstCandle = candles[0];
    const lastCandle = candles[candles.length - 1];

    const openPrice = parseFloat(firstCandle.open);
    const closePrice = parseFloat(lastCandle.close);
    const change = closePrice - openPrice;
    const changePercent = openPrice > 0 ? (change / openPrice) * 100 : 0;

    const high24h = Math.max(...candles.map(c => parseFloat(c.high)));
    const low24h = Math.min(...candles.map(c => parseFloat(c.low)));
    const volume24h = candles.reduce((sum, c) => sum + c.volume, 0);
    const tradeCount24h = candles.reduce((sum, c) => sum + c.trade_count, 0);

    return {
      openPrice,
      closePrice,
      change,
      changePercent: parseFloat(changePercent.toFixed(2)),
      high24h,
      low24h,
      volume24h,
      tradeCount24h
    };
  }

  /**
   * Initialize price history from existing trades (backfill)
   */
  async backfillFromTrades(marketId) {
    const { Trade } = db;

    const trades = await Trade.findAll({
      where: { marketId },
      order: [['createdAt', 'ASC']],
      raw: true
    });

    console.log(`📊 Backfilling ${trades.length} trades for market ${marketId}`);

    for (const trade of trades) {
      await this.recordTrade(
        trade.marketId,
        trade.outcome,
        trade.price,
        trade.quantity,
        trade.createdAt
      );
    }

    // Flush all buffered data
    await this.flushBuffer();

    console.log(`✅ Backfill complete for market ${marketId}`);
  }
}

module.exports = new PriceHistoryService();
