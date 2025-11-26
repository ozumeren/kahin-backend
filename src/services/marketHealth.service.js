// src/services/marketHealth.service.js
const { Op, fn, col, literal } = require('sequelize');
const db = require('../models');
const { Market, Order, Trade, sequelize } = db;
const marketService = require('./market.service');

class MarketHealthService {
  /**
   * Calculate comprehensive health metrics for a market
   */
  async getMarketHealth(marketId) {
    const market = await Market.findByPk(marketId);

    if (!market) {
      throw new Error('Market bulunamadı');
    }

    // Get order book
    const orderBook = await marketService.getOrderBook(marketId);

    // Get last trade time
    const lastTrade = await Trade.findOne({
      where: { marketId },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt', 'price', 'quantity']
    });

    // Calculate 24h metrics
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [volumeResult, tradesCount] = await Promise.all([
      Trade.findOne({
        where: {
          marketId,
          createdAt: { [Op.gte]: twentyFourHoursAgo }
        },
        attributes: [[fn('SUM', col('total')), 'volume']],
        raw: true
      }),
      Trade.count({
        where: {
          marketId,
          createdAt: { [Op.gte]: twentyFourHoursAgo }
        }
      })
    ]);

    const volume24h = parseFloat(volumeResult?.volume || 0);

    // Calculate order book depth
    const yesDepth = (orderBook.yes?.depth?.bidDepth || 0) + (orderBook.yes?.depth?.askDepth || 0);
    const noDepth = (orderBook.no?.depth?.bidDepth || 0) + (orderBook.no?.depth?.askDepth || 0);
    const totalDepth = yesDepth + noDepth;

    // Calculate spreads
    const yesSpread = orderBook.yes?.spread;
    const noSpread = orderBook.no?.spread;

    // Calculate order imbalance (buy pressure vs sell pressure)
    const yesBuyPressure = orderBook.yes?.depth?.bidDepth || 0;
    const yesSellPressure = orderBook.yes?.depth?.askDepth || 0;
    const yesImbalance = yesBuyPressure + yesSellPressure > 0
      ? ((yesBuyPressure - yesSellPressure) / (yesBuyPressure + yesSellPressure) * 100).toFixed(2)
      : 0;

    const noBuyPressure = orderBook.no?.depth?.bidDepth || 0;
    const noSellPressure = orderBook.no?.depth?.askDepth || 0;
    const noImbalance = noBuyPressure + noSellPressure > 0
      ? ((noBuyPressure - noSellPressure) / (noBuyPressure + noSellPressure) * 100).toFixed(2)
      : 0;

    // Calculate time since last trade
    const lastTradeTime = lastTrade ? new Date(lastTrade.createdAt) : null;
    const timeSinceLastTrade = lastTradeTime
      ? this.getTimeSinceLastTrade(lastTradeTime)
      : null;

    // Determine health status
    const healthStatus = this.calculateHealthStatus({
      volume24h,
      totalDepth,
      yesSpread: yesSpread?.percentage,
      noSpread: noSpread?.percentage,
      timeSinceLastTrade: timeSinceLastTrade?.minutes,
      status: market.status,
      isPaused: market.is_paused
    });

    return {
      marketId: market.id,
      marketTitle: market.title,
      marketStatus: market.status,
      isPaused: market.is_paused || false,
      pausedAt: market.paused_at || null,
      pauseReason: market.pause_reason || null,
      healthStatus: healthStatus.status,
      healthScore: healthStatus.score,
      warnings: healthStatus.warnings,
      lastTrade: lastTrade ? {
        time: lastTrade.createdAt,
        price: parseFloat(lastTrade.price).toFixed(2),
        quantity: lastTrade.quantity,
        timeSince: timeSinceLastTrade
      } : null,
      volume24h: volume24h.toFixed(2),
      tradesCount24h: tradesCount,
      liquidity: {
        totalDepth,
        yesDepth,
        noDepth,
        deepLiquidity: totalDepth >= 1000 ? 'good' : totalDepth >= 500 ? 'moderate' : 'low'
      },
      spreads: {
        yes: yesSpread,
        no: noSpread,
        avgSpreadPercent: yesSpread && noSpread
          ? ((parseFloat(yesSpread.percentage) + parseFloat(noSpread.percentage)) / 2).toFixed(2)
          : null
      },
      orderImbalance: {
        yes: {
          buyPressure: yesBuyPressure,
          sellPressure: yesSellPressure,
          imbalance: yesImbalance
        },
        no: {
          buyPressure: noBuyPressure,
          sellPressure: noSellPressure,
          imbalance: noImbalance
        }
      },
      orderBook: {
        yesBids: orderBook.yes?.bids?.length || 0,
        yesAsks: orderBook.yes?.asks?.length || 0,
        noBids: orderBook.no?.bids?.length || 0,
        noAsks: orderBook.no?.asks?.length || 0
      }
    };
  }

  /**
   * Get markets with low liquidity warnings
   */
  async getLowLiquidityMarkets(options = {}) {
    const {
      minDepth = 500,
      maxSpread = 10, // percentage
      minVolume24h = 100,
      maxTimeSinceLastTrade = 24 * 60, // minutes
      limit = 50
    } = options;

    // Get all open markets
    const markets = await Market.findAll({
      where: {
        status: 'open',
        is_paused: { [Op.or]: [false, null] }
      },
      order: [['createdAt', 'DESC']],
      limit: limit * 2 // Get more to filter
    });

    const lowLiquidityMarkets = [];

    for (const market of markets) {
      try {
        const health = await this.getMarketHealth(market.id);

        const warnings = [];

        // Check depth
        if (health.liquidity.totalDepth < minDepth) {
          warnings.push({
            type: 'low_depth',
            severity: 'high',
            message: `Low order book depth: ${health.liquidity.totalDepth} (min: ${minDepth})`
          });
        }

        // Check spread
        const avgSpread = health.spreads.avgSpreadPercent;
        if (avgSpread && parseFloat(avgSpread) > maxSpread) {
          warnings.push({
            type: 'wide_spread',
            severity: 'medium',
            message: `Wide spread: ${avgSpread}% (max: ${maxSpread}%)`
          });
        }

        // Check volume
        if (parseFloat(health.volume24h) < minVolume24h) {
          warnings.push({
            type: 'low_volume',
            severity: 'medium',
            message: `Low 24h volume: ${health.volume24h} (min: ${minVolume24h})`
          });
        }

        // Check last trade time
        if (health.lastTrade && health.lastTrade.timeSince.minutes > maxTimeSinceLastTrade) {
          warnings.push({
            type: 'stale_orders',
            severity: 'low',
            message: `No trades for ${health.lastTrade.timeSince.formatted}`
          });
        }

        if (warnings.length > 0) {
          lowLiquidityMarkets.push({
            ...health,
            liquidityWarnings: warnings
          });
        }

        if (lowLiquidityMarkets.length >= limit) {
          break;
        }
      } catch (error) {
        console.error(`Health check failed for market ${market.id}:`, error.message);
      }
    }

    return {
      count: lowLiquidityMarkets.length,
      markets: lowLiquidityMarkets,
      criteria: {
        minDepth,
        maxSpread,
        minVolume24h,
        maxTimeSinceLastTrade
      }
    };
  }

  /**
   * Pause a market (halt trading)
   */
  async pauseMarket(marketId, reason, adminId) {
    const market = await Market.findByPk(marketId);

    if (!market) {
      throw new Error('Market bulunamadı');
    }

    if (market.status === 'resolved') {
      throw new Error('Sonuçlanmış marketler pause edilemez');
    }

    if (market.is_paused) {
      throw new Error('Market zaten pause edilmiş');
    }

    await market.update({
      is_paused: true,
      paused_at: new Date(),
      paused_by: adminId,
      pause_reason: reason || 'Admin tarafından durduruldu'
    });

    // Cancel all open orders
    const cancelledOrders = await Order.update(
      {
        status: 'CANCELLED'
      },
      {
        where: {
          marketId,
          status: 'OPEN'
        },
        returning: true
      }
    );

    return {
      market,
      cancelledOrders: cancelledOrders[0] || 0,
      message: 'Market pause edildi ve tüm açık emirler iptal edildi'
    };
  }

  /**
   * Resume a paused market
   */
  async resumeMarket(marketId) {
    const market = await Market.findByPk(marketId);

    if (!market) {
      throw new Error('Market bulunamadı');
    }

    if (!market.is_paused) {
      throw new Error('Market zaten aktif');
    }

    if (market.status === 'resolved') {
      throw new Error('Sonuçlanmış marketler resume edilemez');
    }

    await market.update({
      is_paused: false,
      paused_at: null,
      paused_by: null,
      pause_reason: null
    });

    return {
      market,
      message: 'Market aktif edildi, yeni emirler alınabilir'
    };
  }

  /**
   * Calculate overall health status
   */
  calculateHealthStatus(metrics) {
    const warnings = [];
    let score = 100;

    if (metrics.isPaused) {
      return {
        status: 'paused',
        score: 0,
        warnings: ['Market pause edilmiş']
      };
    }

    if (metrics.status !== 'open') {
      return {
        status: 'closed',
        score: 0,
        warnings: ['Market kapalı']
      };
    }

    // Check volume
    if (metrics.volume24h < 100) {
      warnings.push('Çok düşük 24h hacim');
      score -= 30;
    } else if (metrics.volume24h < 500) {
      warnings.push('Düşük 24h hacim');
      score -= 15;
    }

    // Check depth
    if (metrics.totalDepth < 300) {
      warnings.push('Kritik derecede düşük likidite');
      score -= 30;
    } else if (metrics.totalDepth < 500) {
      warnings.push('Düşük likidite');
      score -= 20;
    } else if (metrics.totalDepth < 1000) {
      score -= 10;
    }

    // Check spreads
    const avgSpread = (parseFloat(metrics.yesSpread || 0) + parseFloat(metrics.noSpread || 0)) / 2;
    if (avgSpread > 15) {
      warnings.push('Çok geniş spread');
      score -= 20;
    } else if (avgSpread > 10) {
      warnings.push('Geniş spread');
      score -= 10;
    }

    // Check last trade time
    if (metrics.timeSinceLastTrade > 1440) { // 24 hours
      warnings.push('24 saatten fazladır işlem yok');
      score -= 20;
    } else if (metrics.timeSinceLastTrade > 360) { // 6 hours
      warnings.push('6 saatten fazladır işlem yok');
      score -= 10;
    }

    score = Math.max(0, score);

    let status;
    if (score >= 80) status = 'healthy';
    else if (score >= 60) status = 'moderate';
    else if (score >= 40) status = 'warning';
    else status = 'critical';

    return { status, score, warnings };
  }

  /**
   * Calculate time since last trade
   */
  getTimeSinceLastTrade(lastTradeTime) {
    const now = new Date();
    const diff = now - lastTradeTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let formatted;
    if (days > 0) {
      formatted = `${days} gün önce`;
    } else if (hours > 0) {
      formatted = `${hours} saat önce`;
    } else if (minutes > 0) {
      formatted = `${minutes} dakika önce`;
    } else {
      formatted = 'Az önce';
    }

    return { minutes, hours, days, formatted };
  }

  /**
   * Get markets that should be auto-closed
   */
  async getMarketsForAutoClose(inactiveDays = 7) {
    const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    const markets = await Market.findAll({
      where: {
        status: 'open',
        is_paused: { [Op.or]: [false, null] }
      }
    });

    const marketsToClose = [];

    for (const market of markets) {
      const lastTrade = await Trade.findOne({
        where: { marketId: market.id },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt']
      });

      if (!lastTrade || new Date(lastTrade.createdAt) < cutoffDate) {
        const daysSinceLastTrade = lastTrade
          ? Math.floor((new Date() - new Date(lastTrade.createdAt)) / (24 * 60 * 60 * 1000))
          : null;

        marketsToClose.push({
          id: market.id,
          title: market.title,
          lastTradeDate: lastTrade?.createdAt || null,
          daysSinceLastTrade,
          reason: lastTrade
            ? `${daysSinceLastTrade} gün boyunca işlem yok`
            : 'Hiç işlem yapılmamış'
        });
      }
    }

    return {
      count: marketsToClose.length,
      markets: marketsToClose,
      criteria: {
        inactiveDays
      }
    };
  }
}

module.exports = new MarketHealthService();
