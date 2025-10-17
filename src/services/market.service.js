// src/services/market.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Share, User, Transaction, Order, sequelize } = db;
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');

class MarketService {
  constructor() {
    // Redis'te order book'u populate edilmiş marketleri cache'le
    this.populatedMarkets = new Set();
  }

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
    const { title, description, closing_date, image_url } = marketData;

    if (!title || !closing_date) {
      throw ApiError.badRequest('Başlık ve kapanış tarihi zorunludur.');
    }

    const newMarket = await Market.create({
      title,
      description,
      closing_date,
      image_url,
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

    // Kontroller (aynı...)
    if (!market) {
      throw ApiError.notFound('Pazar bulunamadı.');
    }

    if (market.status === 'resolved') {
      throw ApiError.conflict('Bu pazar zaten sonuçlandırılmış.');
    }

    if (typeof finalOutcome !== 'boolean') {
      throw ApiError.badRequest('Sonuç true (Evet) veya false (Hayır) olmalıdır.');
    }

    // 2. Pazarı güncelle
    market.status = 'resolved';
    market.outcome = finalOutcome;
    await market.save({ transaction: t });

    // *** DÜZELTME: Tüm açık emirleri iptal et ve para/hisse iadesi yap ***
    const openOrders = await Order.findAll({
      where: { marketId, status: 'OPEN' },
      transaction: t
    });

    console.log(`📋 ${openOrders.length} açık emir iptal ediliyor...`);

    // İptal edilen emirleri topla (WebSocket bildirimleri için)
    const cancelledOrdersData = [];

    for (const order of openOrders) {
      console.log(`İptal edilen emir: ${order.type} ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} @ ${order.price}`);
      
      // Redis'ten sil
      const outcomeString = order.outcome ? 'yes' : 'no';
      const orderKey = order.type === 'BUY' ? 'bids' : 'asks';
      const redisKey = `market:${marketId}:${outcomeString}:${orderKey}`;
      
      // Redis'teki tüm değerleri kontrol et ve bu emri sil
      const allOrders = await redisClient.zRangeWithScores(redisKey, 0, -1);
      for (const redisOrder of allOrders) {
        if (redisOrder.value.startsWith(`${order.id}:`)) {
          await redisClient.zRem(redisKey, redisOrder.value);
          console.log(`Redis'ten silindi: ${redisKey} -> ${redisOrder.value}`);
        }
      }

      // *** DÜZELTME: Para/hisse iadesi ***
      let refundAmount = 0;
      let refundType = '';
      
      if (order.type === 'BUY') {
        // BUY emri için para iadesi
        const user = await User.findByPk(order.userId, { 
          lock: t.LOCK.UPDATE, 
          transaction: t 
        });
        
        refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
        refundType = 'balance';
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction: t });

        await Transaction.create({
          userId: order.userId,
          marketId: order.marketId,
          type: 'refund',
          amount: refundAmount,
          description: `Market sonuçlandı - BUY emri iptal: ${order.quantity} x ${order.price} = ${refundAmount} TL iade`
        }, { transaction: t });

        console.log(`💰 BUY emir iadesi: User ${order.userId} -> ${refundAmount} TL`);
      }

      if (order.type === 'SELL') {
        // SELL emri için hisse iadesi
        refundType = 'shares';
        let share = await Share.findOne({
          where: { 
            userId: order.userId, 
            marketId: order.marketId, 
            outcome: order.outcome 
          },
          transaction: t
        });

        if (!share) {
          // Hisse kaydı yoksa oluştur
          share = await Share.create({
            userId: order.userId,
            marketId: order.marketId,
            outcome: order.outcome,
            quantity: order.quantity
          }, { transaction: t });
        } else {
          // Mevcut hisseye ekle
          share.quantity = parseInt(share.quantity) + parseInt(order.quantity);
          await share.save({ transaction: t });
        }

        await Transaction.create({
          userId: order.userId,
          marketId: order.marketId,
          type: 'refund',
          amount: 0,
          description: `Market sonuçlandı - SELL emri iptal: ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} hisse iade`
        }, { transaction: t });

        console.log(`📈 SELL emir iadesi: User ${order.userId} -> ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} hisse`);
      }

      // Emri iptal et
      order.status = 'CANCELLED';
      await order.save({ transaction: t });
      
      // İptal edilen emir bilgisini sakla (WebSocket bildirimi için)
      cancelledOrdersData.push({
        userId: order.userId,
        orderId: order.id,
        marketId: order.marketId,
        orderType: order.type,
        outcome: order.outcome,
        quantity: order.quantity,
        price: order.price,
        refundAmount: refundAmount,
        refundType: refundType
      });
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
        resolvedMarket: market,
        cancelledOrders: openOrders.length
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

    // 🆕 İptal edilen emirler için WebSocket bildirimi gönder
    for (const cancelledOrder of cancelledOrdersData) {
      try {
        await websocketServer.publishOrderCancelled(cancelledOrder.userId, {
          orderId: cancelledOrder.orderId,
          marketId: cancelledOrder.marketId,
          marketTitle: market.title,
          orderType: cancelledOrder.orderType,
          outcome: cancelledOrder.outcome,
          quantity: cancelledOrder.quantity,
          price: cancelledOrder.price,
          reason: 'market_resolved',
          refundAmount: cancelledOrder.refundAmount,
          refundType: cancelledOrder.refundType
        });
      } catch (error) {
        console.error('Order cancelled WebSocket bildirimi hatası:', error.message);
      }
    }

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

    // 2. Bu market daha önce populate edilmiş mi kontrol et
    if (!this.populatedMarkets.has(marketId)) {
      const redisHasData = await this.checkRedisOrderBookExists(marketId);
      
      if (!redisHasData) {
        console.log(`📚 Redis'te order book yok, database'den yükleniyor: ${marketId}`);
        await this.populateOrderBookFromDatabase(marketId);
      }
      
      // Cache'e ekle ki bir daha kontrol etmeyelim
      this.populatedMarkets.add(marketId);
    }

    // 4. Redis'ten order book verilerini çek
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

    // 5. Her outcome için Redis anahtarları
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
        const parts = item.value.split(':');
        const orderId = parts[0];
        const quantity = parts[1];
        // parts[2] userId olabilir, onu görmezden gel
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
        const parts = item.value.split(':');
        const orderId = parts[0];
        const quantity = parts[1];
        // parts[2] userId olabilir, onu görmezden gel
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

  // Redis'te order book'un olup olmadığını kontrol et
  async checkRedisOrderBookExists(marketId) {
    try {
      const keys = [
        `market:${marketId}:yes:bids`,
        `market:${marketId}:yes:asks`, 
        `market:${marketId}:no:bids`,
        `market:${marketId}:no:asks`
      ];
      
      // En az bir key'de veri varsa Redis'te order book var demektir
      for (const key of keys) {
        const count = await redisClient.zCard(key);
        if (count > 0) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Redis order book check hatası:', error);
      return false;
    }
  }

  // Database'den açık emirleri yükleyip Redis'e populate et
  async populateOrderBookFromDatabase(marketId) {
    try {
      // Database'den bu market'e ait açık emirleri çek
      const openOrders = await Order.findAll({
        where: {
          marketId,
          status: 'OPEN'
        },
        include: [{
          model: User,
          attributes: ['id']
        }],
        order: [['createdAt', 'ASC']] // Eski emirler önce
      });

      console.log(`📊 Database'den ${openOrders.length} açık emir yükleniyor...`);

      // Her emri Redis'e ekle
      for (const order of openOrders) {
        const outcomeString = order.outcome ? 'yes' : 'no';
        const orderType = order.type === 'BUY' ? 'bids' : 'asks';
        const redisKey = `market:${marketId}:${outcomeString}:${orderType}`;
        
        // Redis'e emir ekle (userId ile birlikte)
        await redisClient.zAdd(redisKey, {
          score: parseFloat(order.price),
          value: `${order.id}:${order.quantity}:${order.userId || ''}`
        });
      }

      console.log(`✅ Order book Redis'e yüklendi: ${marketId}`);
      
      // Cache'e ekle
      this.populatedMarkets.add(marketId);
    } catch (error) {
      console.error('Database order book populate hatası:', error);
      throw error;
    }
  }

  // Tüm aktif marketler için order book'ları initialize et
  async initializeAllOrderBooks() {
    try {
      const activeMarkets = await Market.findAll({
        where: {
          status: 'open'
        },
        attributes: ['id', 'title']
      });

      console.log(`🔄 ${activeMarkets.length} aktif market için order book initialize ediliyor...`);

      for (const market of activeMarkets) {
        const hasData = await this.checkRedisOrderBookExists(market.id);
        if (!hasData) {
          await this.populateOrderBookFromDatabase(market.id);
          console.log(`📚 ${market.title} order book'u yüklendi`);
        } else {
          // Cache'e ekle ki sonraki çağrılarda kontrol etmesin
          this.populatedMarkets.add(market.id);
        }
      }

      console.log('✅ Tüm order booklar initialize edildi');
    } catch (error) {
      console.error('Order book initialization hatası:', error);
    }
  }
}

module.exports = new MarketService();