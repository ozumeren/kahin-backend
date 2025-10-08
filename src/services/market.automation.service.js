const cron = require('node-cron');
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Order, Share, User, sequelize } = db;
const redisClient = require('../../config/redis');
const websocketServer = require('../../config/websocket');

class MarketAutomationService {
  constructor() {
    this.isRunning = false;
  }

  // Otomasyonu başlat
  startAutomation() {
    if (this.isRunning) {
      console.log('Market otomasyonu zaten çalışıyor.');
      return;
    }

    // Her dakika kontrol et (production'da 5 dakikada bir yapabilirsiniz)
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.checkAndCloseExpiredMarkets();
    }, {
      scheduled: false,
      timezone: "Europe/Istanbul"
    });

    this.cronJob.start();
    this.isRunning = true;
    console.log('✓ Market otomasyonu başlatıldı (her dakika kontrol)');
  }

  // Otomasyonu durdur
  stopAutomation() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('✓ Market otomasyonu durduruldu');
    }
  }

  // Süresi dolmuş marketleri kontrol et ve kapat
  async checkAndCloseExpiredMarkets() {
    const t = await sequelize.transaction();
    
    try {
      const now = new Date();
      
      // Süresi dolmuş açık marketleri bul
      const expiredMarkets = await Market.findAll({
        where: {
          status: 'open',
          closing_date: {
            [Op.lte]: now
          }
        },
        transaction: t
      });

      if (expiredMarkets.length === 0) {
        await t.commit();
        return;
      }

      console.log(`🕐 ${expiredMarkets.length} adet süresi dolmuş market bulundu, kapatılıyor...`);

      for (const market of expiredMarkets) {
        await this.closeMarket(market, t);
      }

      await t.commit();
      console.log(` ${expiredMarkets.length} market başarıyla kapatıldı.`);

    } catch (error) {
      await t.rollback();
      console.error(' Market kapama otomasyonu hatası:', error);
    }
  }

  // Tek bir marketi kapat
  async closeMarket(market, transaction) {
    const t = transaction;

    try {
      console.log(`Market kapatılıyor: ${market.title} (${market.id})`);

      // 1. Market durumunu "closed" yap
      market.status = 'closed';
      await market.save({ transaction: t });

      // 2. Açık emirleri iptal et ve para iadesi yap
      await this.cancelOpenOrders(market.id, t);

      // 3. Redis'teki order book'u temizle
      await this.clearOrderBookFromRedis(market.id);

      // 4. Sonuçları belirle (şimdilik otomatik FALSE, admin panelinden değiştirilebilir)
      market.result = false; // Admin sonra değiştirebilir
      await market.save({ transaction: t });

      // 5. WebSocket ile market kapanma bildirimi gönder
      await this.notifyMarketClosed(market.id);

      console.log(`Market kapatıldı: ${market.title}`);

    } catch (error) {
      console.error(`Market kapatma hatası (${market.id}):`, error);
      throw error;
    }
  }

  // Açık emirleri iptal et ve para iadesi yap
  async cancelOpenOrders(marketId, transaction) {
    const t = transaction;

    // Açık emirleri bul
    const openOrders = await Order.findAll({
      where: {
        marketId,
        status: 'OPEN'
      },
      transaction: t
    });

    console.log(`${openOrders.length} adet açık emir iptal ediliyor...`);

    for (const order of openOrders) {
      // BUY emirleri için para iadesi
      if (order.type === 'BUY') {
        const user = await User.findByPk(order.userId, {
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        const refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction: t });

        console.log(`BUY emir iadesi: User ${order.userId} -> ${refundAmount} TL`);
      }

      // SELL emirleri için hisse iadesi
      if (order.type === 'SELL') {
        let share = await Share.findOne({
          where: {
            userId: order.userId,
            marketId: order.marketId,
            outcome: order.outcome
          },
          transaction: t
        });

        if (!share) {
          share = await Share.create({
            userId: order.userId,
            marketId: order.marketId,
            outcome: order.outcome,
            quantity: order.quantity
          }, { transaction: t });
        } else {
          share.quantity = parseInt(share.quantity) + parseInt(order.quantity);
          await share.save({ transaction: t });
        }

        console.log(`SELL emir iadesi: User ${order.userId} -> ${order.quantity} hisse`);
      }

      // Emri iptal et
      order.status = 'CANCELLED';
      order.cancelled_reason = 'MARKET_CLOSED';
      await order.save({ transaction: t });
    }
  }

  // Redis'teki order book'u temizle
  async clearOrderBookFromRedis(marketId) {
    try {
      const keys = [
        `market:${marketId}:yes:bids`,
        `market:${marketId}:yes:asks`,
        `market:${marketId}:no:bids`,
        `market:${marketId}:no:asks`
      ];

      for (const key of keys) {
        await redisClient.del(key);
      }

      console.log(`Redis order book temizlendi: ${marketId}`);
    } catch (error) {
      console.error(`Redis temizleme hatası (${marketId}):`, error);
    }
  }

  // WebSocket ile market kapanma bildirimi
  async notifyMarketClosed(marketId) {
    try {
      const notificationData = {
        type: 'market_closed',
        marketId,
        message: 'Pazar kapatıldı',
        timestamp: new Date().toISOString()
      };

      // Redis'e publish et
      await redisClient.publish(
        `market:${marketId}:notifications`,
        JSON.stringify(notificationData)
      );

      console.log(`Market kapanma bildirimi gönderildi: ${marketId}`);
    } catch (error) {
      console.error(`WebSocket bildirim hatası (${marketId}):`, error);
    }
  }

  // Manuel market kapama (admin için)
  async manualCloseMarket(marketId, adminUserId, result = null) {
    const t = await sequelize.transaction();

    try {
      const market = await Market.findByPk(marketId, { transaction: t });
      
      if (!market) {
        throw new Error('Market bulunamadı');
      }

      if (market.status !== 'open') {
        throw new Error('Market zaten kapalı');
      }

      // Sonuç belirtilmişse ayarla
      if (result !== null) {
        market.result = result;
      }

      await this.closeMarket(market, t);
      await t.commit();

      console.log(`Admin ${adminUserId} tarafından market manuel kapatıldı: ${marketId}`);
      
      return {
        message: 'Market başarıyla kapatıldı',
        marketId,
        result: market.result
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new MarketAutomationService();