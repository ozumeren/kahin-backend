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
      throw new Error('Pazar bulunamadı.');
    }
    return market;
  }

  async create(marketData) {
    const { title, description, closing_date } = marketData;

    if (!title || !closing_date) {
      throw new Error('Başlık ve kapanış tarihi zorunludur.');
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
      throw new Error('Pazar bulunamadı.');
    }

    if (market.status === 'resolved') {
      throw new Error('Sonuçlanmış pazar kapatılamaz.');
    }

    if (market.status === 'closed') {
      throw new Error('Bu pazar zaten kapalı.');
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
        throw new Error('Pazar bulunamadı.');
      }

      if (market.status === 'resolved') {
        throw new Error('Bu pazar zaten sonuçlandırılmış.');
      }

      // Outcome boolean olmalı (true veya false)
      if (typeof finalOutcome !== 'boolean') {
        throw new Error('Sonuç true (Evet) veya false (Hayır) olmalıdır.');
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
}

module.exports = new MarketService();