// src/controllers/priceHistory.controller.js
const priceHistoryService = require('../services/priceHistory.service');

class PriceHistoryController {
  /**
   * Get OHLCV candlestick data for a market
   * GET /api/v1/markets/:id/candles?outcome=true&interval=1h&limit=100
   */
  async getCandles(req, res, next) {
    try {
      const { id: marketId } = req.params;
      const {
        outcome = 'true',
        interval = '1h',
        startTime,
        endTime,
        limit = 100
      } = req.query;

      const candles = await priceHistoryService.getPriceHistory(
        marketId,
        outcome === 'true',
        interval,
        {
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          limit: parseInt(limit)
        }
      );

      res.status(200).json({
        success: true,
        marketId,
        outcome: outcome === 'true',
        interval,
        count: candles.length,
        data: candles
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get latest candle for a market
   * GET /api/v1/markets/:id/candles/latest?outcome=true&interval=1h
   */
  async getLatestCandle(req, res, next) {
    try {
      const { id: marketId } = req.params;
      const { outcome = 'true', interval = '1h' } = req.query;

      const candle = await priceHistoryService.getLatestCandle(
        marketId,
        outcome === 'true',
        interval
      );

      if (!candle) {
        return res.status(200).json({
          success: true,
          marketId,
          data: null,
          message: 'No price history available'
        });
      }

      res.status(200).json({
        success: true,
        marketId,
        outcome: outcome === 'true',
        interval,
        data: candle
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get 24h statistics for a market
   * GET /api/v1/markets/:id/stats/24h?outcome=true
   */
  async get24hStats(req, res, next) {
    try {
      const { id: marketId } = req.params;
      const { outcome = 'true' } = req.query;

      const stats = await priceHistoryService.get24hStats(
        marketId,
        outcome === 'true'
      );

      if (!stats) {
        return res.status(200).json({
          success: true,
          marketId,
          data: null,
          message: 'No 24h data available'
        });
      }

      res.status(200).json({
        success: true,
        marketId,
        outcome: outcome === 'true',
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current price from cache
   * GET /api/v1/markets/:id/price?outcome=true
   */
  async getCurrentPrice(req, res, next) {
    try {
      const { id: marketId } = req.params;
      const { outcome = 'true' } = req.query;

      const price = await priceHistoryService.getCurrentPrice(
        marketId,
        outcome === 'true'
      );

      res.status(200).json({
        success: true,
        marketId,
        outcome: outcome === 'true',
        price
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Backfill price history from existing trades (admin only)
   * POST /api/v1/admin/markets/:id/backfill-prices
   */
  async backfillPrices(req, res, next) {
    try {
      const { id: marketId } = req.params;

      await priceHistoryService.backfillFromTrades(marketId);

      res.status(200).json({
        success: true,
        message: `Price history backfilled for market ${marketId}`
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PriceHistoryController();
