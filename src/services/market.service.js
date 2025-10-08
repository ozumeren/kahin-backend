// src/services/market.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Share, User, Transaction, Order, sequelize } = db;
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');

class MarketService {
  async findAll(queryOptions = {}) {
    const markets = await Market.findAll({ where: queryOptions });
    return markets;
  }

  async findById(marketId) {
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw ApiError.notFound('Pazar bulunamadı.');
    }
    return market;
  }

  async create(marketData) {
    const { title, description, closing_date } = marketData;

    if (!title || !closing_date) {
      throw ApiError.badRequest('Başlık ve kapanış tarihi zorunludur.');
    }

    const newMarket = await Market.create({
      title,
      description,
      closing_date,
      status: 'open'
    });

    return newMarket;
  }

  async closeMarket(marketId) {
    const market = await Market.findByPk(marketId);
    
    if (!market) {
      throw ApiError.notFound('Pazar bulunamadı.');
    }

    if (market.status === 'resolved') {
      throw ApiError.badRequest('Sonuçlanmış pazar kapatılamaz.');
    }

    if (market.status === 'closed') {
      throw ApiError.conflict('Bu pazar zaten kapalı.');
    }

    market.status = 'closed';
    await market.save();

    return market;
  }

  async resolveMarket(marketId, finalOutcome) {
    const t = await sequelize.transaction();
    
    try {
      // 1. Pazarı bul ve kilitle
      const market = await Market.findByPk(marketId, { 
        lock: t.LOCK.UPDATE, 
        transaction: t 
      });

      // Kontroller
      if (!market) {
        throw ApiError.notFound('Pazar bulunamadı.');
      }

      if (market.status === 'resolved') {
        throw ApiError.conflict('Bu pazar zaten sonuçlandırılmış.');
      }

      // Outcome boolean olmalı (true veya false)
      if (typeof finalOutcome !== 'boolean') {
        throw ApiError.badRequest('Sonuç true (Evet) veya false (Hayır) olmalıdır.');
      }

      // 2. Pazarı güncelle
      market.status = 'resolved';
      market.outcome = finalOutcome;
      await market.save({ transaction: t });

      // 3. Tüm açık emirleri iptal et ve Redis'ten temizle
      const openOrders = await Order.findAll({
        where: { marketId, status: 'OPEN' },
        transaction: t
      });

      for (const order of openOrders) {
        // Redis'ten sil
        const outcomeString = order.outcome ? 'yes' : 'no';
        const orderKey = order.type === 'BUY' ? 'bids' : 'asks';
        const redisKey = `market:${marketId}:${outcomeString}:${orderKey}`;
        
        // Redis'teki tüm değerleri kontrol et ve bu emri sil
        const allOrders = await redisClient.zRangeWithScores(redisKey, 0, -1);
        for (const redisOrder of allOrders) {
          if (redisOrder.value.startsWith(`${order.id}:`)) {
            await redisClient.zRem(redisKey, redisOrder.value);
          }
        }

        // Veritabanında iptal et
        order.status = 'CANCELLED';
        await order.save({ transaction: t });
      }

      // 4. Kazanan hisseleri bul
      const winningShares = await Share.findAll({
        where: { marketId, outcome: finalOutcome },
        transaction: t
      });

      if (winningShares.length === 0) {
        await t.commit();
        return { 
          message: 'Pazar sonuçlandırıldı, ancak kazanan hisse bulunamadı.',
          resolvedMarket: market 
        };
      }

      // 5. Kazançları hesapla ve dağıt
      let totalPayout = 0;
      const payoutDetails = [];

      for (const share of winningShares) {
        const payoutAmount = parseFloat(share.quantity) * 1.00;
        
        // Kullanıcıyı bul ve kilitle
        const winner = await User.findByPk(share.userId, { 
          lock: t.LOCK.UPDATE, 
          transaction: t 
        });

        if (!winner) {
          console.warn(`Kullanıcı bulunamadı: ${share.userId}`);
          continue;
        }

        // Bakiyeyi artır
        winner.balance = parseFloat(winner.balance) + payoutAmount;
        await winner.save({ transaction: t });

        // Transaction kaydı oluştur
        await Transaction.create({
          userId: winner.id,
          marketId: market.id,
          type: 'payout',
          amount: payoutAmount,
          description: `Pazar "${market.title}" sonucundan kazanılan ödeme. ${share.quantity} adet kazanan hisse.`
        }, { transaction: t });

        totalPayout += payoutAmount;
        payoutDetails.push({
          userId: winner.id,
          username: winner.username,
          shares: share.quantity,
          payout: payoutAmount
        });
      }

      await t.commit();

      return {
        message: 'Pazar başarıyla sonuçlandırıldı ve ödemeler yapıldı.',
        resolvedMarket: market,
        stats: {
          totalWinners: winningShares.length,
          totalPayout: totalPayout,
          cancelledOrders: openOrders.length
        },
        payoutDetails
      };

    } catch (error) {
      await t.rollback();
      console.error('Pazar sonuçlandırma hatası:', error);
      throw error;
    }
  }

  async getOrderBook(marketId) {
    // 1. Market'in var olduğunu kontrol et
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw ApiError.notFound('Pazar bulunamadı.');
    }

    // 2. Redis'ten order book verilerini çek
    const orderBook = {
      marketId: market.id,
      marketTitle: market.title,
      marketStatus: market.status,
      timestamp: new Date().toISOString(),
      yes: {
        bids: [],  // Alış emirleri (YES'e yatırım yapanlar)
        asks: []   // Satış emirleri (YES satanlar)
      },
      no: {
        bids: [],  // Alış emirleri (NO'ya yatırım yapanlar)
        asks: []   // Satış emirleri (NO satanlar)
      }
    };

    // 3. Her outcome için Redis anahtarları
    const outcomes = [
      { outcome: 'yes', value: true },
      { outcome: 'no', value: false }
    ];

    for (const { outcome, value } of outcomes) {
      // Bids (Alış emirleri) - Fiyata göre azalan sırada
      const bidsKey = `market:${marketId}:${outcome}:bids`;
      const bidsData = await redisClient.zRangeWithScores(bidsKey, 0, -1, { REV: true });
      
      // Asks (Satış emirleri) - Fiyata göre artan sırada
      const asksKey = `market:${marketId}:${outcome}:asks`;
      const asksData = await redisClient.zRangeWithScores(asksKey, 0, -1);

      // 4. Bids'i grupla ve formatla (aynı fiyattaki emirleri topla)
      const bidsMap = new Map();
      for (const item of bidsData) {
        const [orderId, quantity] = item.value.split(':');
        const price = item.score;
        const currentQty = bidsMap.get(price) || 0;
        bidsMap.set(price, currentQty + parseInt(quantity));
      }

      // Map'i array'e çevir ve formatla
      orderBook[outcome].bids = Array.from(bidsMap.entries())
        .map(([price, quantity]) => ({
          price: parseFloat(price).toFixed(2),
          quantity: quantity,
          total: (price * quantity).toFixed(2)
        }))
        .sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); // Yüksek fiyattan düşüğe

      // 5. Asks'i grupla ve formatla
      const asksMap = new Map();
      for (const item of asksData) {
        const [orderId, quantity] = item.value.split(':');
        const price = item.score;
        const currentQty = asksMap.get(price) || 0;
        asksMap.set(price, currentQty + parseInt(quantity));
      }

      orderBook[outcome].asks = Array.from(asksMap.entries())
        .map(([price, quantity]) => ({
          price: parseFloat(price).toFixed(2),
          quantity: quantity,
          total: (price * quantity).toFixed(2)
        }))
        .sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); // Düşük fiyattan yükseğe
    }

    // 6. Order book derinliği ve spread hesapla
    const yesSpread = this.calculateSpread(orderBook.yes.bids, orderBook.yes.asks);
    const noSpread = this.calculateSpread(orderBook.no.bids, orderBook.no.asks);

    // 7. Mid price hesapla (best bid + best ask) / 2
    orderBook.yes.midPrice = this.calculateMidPrice(orderBook.yes.bids, orderBook.yes.asks);
    orderBook.no.midPrice = this.calculateMidPrice(orderBook.no.bids, orderBook.no.asks);

    // 8. Spread bilgisi
    orderBook.yes.spread = yesSpread;
    orderBook.no.spread = noSpread;

    // 9. Likidite derinliği (toplam miktar)
    orderBook.yes.depth = {
      bidDepth: orderBook.yes.bids.reduce((sum, bid) => sum + bid.quantity, 0),
      askDepth: orderBook.yes.asks.reduce((sum, ask) => sum + ask.quantity, 0)
    };
    orderBook.no.depth = {
      bidDepth: orderBook.no.bids.reduce((sum, bid) => sum + bid.quantity, 0),
      askDepth: orderBook.no.asks.reduce((sum, ask) => sum + ask.quantity, 0)
    };

    return orderBook;
  }

  calculateSpread(bids, asks) {
    if (bids.length === 0 || asks.length === 0) {
      return null;
    }
    const bestBid = parseFloat(bids[0].price);
    const bestAsk = parseFloat(asks[0].price);
    const spread = bestAsk - bestBid;
    const spreadPercent = ((spread / bestBid) * 100).toFixed(2);
    
    return {
      absolute: spread.toFixed(2),
      percentage: spreadPercent,
      bestBid: bestBid.toFixed(2),
      bestAsk: bestAsk.toFixed(2)
    };
  }

  calculateMidPrice(bids, asks) {
    if (bids.length === 0 || asks.length === 0) {
      return null;
    }
    const bestBid = parseFloat(bids[0].price);
    const bestAsk = parseFloat(asks[0].price);
    return ((bestBid + bestAsk) / 2).toFixed(2);
  }
}

module.exports = new MarketService();