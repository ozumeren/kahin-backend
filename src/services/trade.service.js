// src/services/trade.service.js
const { Trade, User, Market, Order } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');

class TradeService {
  // Kullanıcının tüm trade'lerini getir (hem alıcı hem satıcı olarak)
  async getUserTrades(userId, filters = {}) {
    const where = {
      [Op.or]: [
        { buyerId: userId },
        { sellerId: userId }
      ]
    };

    // Market filtresi
    if (filters.marketId) {
      where.marketId = filters.marketId;
    }

    // Outcome filtresi
    if (filters.outcome !== undefined) {
      where.outcome = filters.outcome;
    }

    // Tarih aralığı
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt[Op.gte] = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt[Op.lte] = new Date(filters.endDate);
      }
    }

    const trades = await Trade.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Buyer',
          attributes: ['id', 'username']
        },
        {
          model: User,
          as: 'Seller',
          attributes: ['id', 'username']
        },
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'outcome']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50,
      offset: filters.offset || 0
    });

    // Her trade için kullanıcının rolünü belirle (alıcı mı satıcı mı?)
    const tradesWithRole = trades.map(trade => {
      const tradeData = trade.toJSON();
      tradeData.myRole = trade.buyerId === userId ? 'buyer' : 'seller';
      tradeData.myAction = trade.buyerId === userId ? 'BUY' : 'SELL';
      return tradeData;
    });

    const total = await Trade.count({ where });

    return {
      trades: tradesWithRole,
      pagination: {
        total,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
        hasMore: total > (filters.offset || 0) + (filters.limit || 50)
      }
    };
  }

  // Belirli bir market'taki tüm trade'leri getir (public)
  async getMarketTrades(marketId, filters = {}) {
    const where = { marketId };

    // Outcome filtresi
    if (filters.outcome !== undefined) {
      where.outcome = filters.outcome;
    }

    const trades = await Trade.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Buyer',
          attributes: ['id', 'username']
        },
        {
          model: User,
          as: 'Seller',
          attributes: ['id', 'username']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 100,
      offset: filters.offset || 0
    });

    const total = await Trade.count({ where });

    // Market için istatistikler
    const stats = await this.getMarketTradeStats(marketId, filters.outcome);

    return {
      trades,
      stats,
      pagination: {
        total,
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        hasMore: total > (filters.offset || 0) + (filters.limit || 100)
      }
    };
  }

  // Market için trade istatistikleri
  async getMarketTradeStats(marketId, outcome = null) {
    const where = { marketId };
    if (outcome !== null) {
      where.outcome = outcome;
    }

    const trades = await Trade.findAll({
      where,
      attributes: ['quantity', 'price', 'total']
    });

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        totalVolume: '0.00',
        avgPrice: '0.00',
        minPrice: '0.00',
        maxPrice: '0.00',
        totalQuantity: 0
      };
    }

    let totalVolume = 0;
    let totalQuantity = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let priceSum = 0;

    trades.forEach(trade => {
      const price = parseFloat(trade.price);
      const quantity = parseInt(trade.quantity);
      const total = parseFloat(trade.total);

      totalVolume += total;
      totalQuantity += quantity;
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);
      priceSum += price;
    });

    const avgPrice = priceSum / trades.length;

    return {
      totalTrades: trades.length,
      totalVolume: totalVolume.toFixed(2),
      avgPrice: avgPrice.toFixed(2),
      minPrice: minPrice.toFixed(2),
      maxPrice: maxPrice.toFixed(2),
      totalQuantity
    };
  }

  // Kullanıcının belirli bir market'taki trade'lerini getir
  async getUserMarketTrades(userId, marketId) {
    const where = {
      marketId,
      [Op.or]: [
        { buyerId: userId },
        { sellerId: userId }
      ]
    };

    const trades = await Trade.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Buyer',
          attributes: ['id', 'username']
        },
        {
          model: User,
          as: 'Seller',
          attributes: ['id', 'username']
        },
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'outcome']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Kullanıcının bu marketteki özet bilgileri
    let totalBought = 0;
    let totalSold = 0;
    let avgBuyPrice = 0;
    let avgSellPrice = 0;
    let buyCount = 0;
    let sellCount = 0;

    trades.forEach(trade => {
      const quantity = parseInt(trade.quantity);
      const price = parseFloat(trade.price);

      if (trade.buyerId === userId) {
        totalBought += quantity;
        avgBuyPrice += price;
        buyCount++;
      } else {
        totalSold += quantity;
        avgSellPrice += price;
        sellCount++;
      }
    });

    avgBuyPrice = buyCount > 0 ? (avgBuyPrice / buyCount).toFixed(2) : '0.00';
    avgSellPrice = sellCount > 0 ? (avgSellPrice / sellCount).toFixed(2) : '0.00';

    const tradesWithRole = trades.map(trade => {
      const tradeData = trade.toJSON();
      tradeData.myRole = trade.buyerId === userId ? 'buyer' : 'seller';
      tradeData.myAction = trade.buyerId === userId ? 'BUY' : 'SELL';
      return tradeData;
    });

    return {
      trades: tradesWithRole,
      summary: {
        totalBought,
        totalSold,
        netPosition: totalBought - totalSold,
        avgBuyPrice,
        avgSellPrice,
        totalTrades: trades.length
      }
    };
  }

  // Kullanıcının trade özeti (genel)
  async getUserTradeSummary(userId) {
    const trades = await Trade.findAll({
      where: {
        [Op.or]: [
          { buyerId: userId },
          { sellerId: userId }
        ]
      },
      attributes: ['buyerId', 'sellerId', 'quantity', 'price', 'total']
    });

    let totalBought = 0;
    let totalSold = 0;
    let totalSpent = 0;
    let totalEarned = 0;
    let buyTrades = 0;
    let sellTrades = 0;

    trades.forEach(trade => {
      const quantity = parseInt(trade.quantity);
      const total = parseFloat(trade.total);

      if (trade.buyerId === userId) {
        totalBought += quantity;
        totalSpent += total;
        buyTrades++;
      } else {
        totalSold += quantity;
        totalEarned += total;
        sellTrades++;
      }
    });

    const netPnL = totalEarned - totalSpent;
    const roi = totalSpent > 0 ? ((netPnL / totalSpent) * 100).toFixed(2) : '0.00';

    return {
      totalTrades: trades.length,
      buyTrades,
      sellTrades,
      totalBought,
      totalSold,
      netPosition: totalBought - totalSold,
      totalSpent: totalSpent.toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      netPnL: netPnL.toFixed(2),
      roi: `${roi}%`
    };
  }

  // Son işlemler (Real-time feed için)
  async getRecentTrades(limit = 20, marketId = null) {
    const where = {};
    if (marketId) {
      where.marketId = marketId;
    }

    const trades = await Trade.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Buyer',
          attributes: ['id', 'username']
        },
        {
          model: User,
          as: 'Seller',
          attributes: ['id', 'username']
        },
        {
          model: Market,
          attributes: ['id', 'title']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    return trades;
  }

  // Belirli bir trade'in detayını getir
  async getTradeById(tradeId) {
    const trade = await Trade.findByPk(tradeId, {
      include: [
        {
          model: User,
          as: 'Buyer',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'Seller',
          attributes: ['id', 'username', 'email']
        },
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'outcome']
        },
        {
          model: Order,
          as: 'BuyOrder',
          attributes: ['id', 'type', 'price', 'quantity', 'status']
        },
        {
          model: Order,
          as: 'SellOrder',
          attributes: ['id', 'type', 'price', 'quantity', 'status']
        }
      ]
    });

    if (!trade) {
      throw ApiError.notFound('Trade kaydı bulunamadı.');
    }

    return trade;
  }
}

module.exports = new TradeService();