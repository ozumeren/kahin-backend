// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;
const redisClient = require('../../config/redis');

// Redis anahtar isimlerini oluşturan yardımcı fonksiyon
const getMarketKeys = (marketId, outcome) => {
  const outcomeString = outcome ? 'yes' : 'no';
  return {
    bids: `market:${marketId}:${outcomeString}:bids`, // Alış emirleri (Sorted Set)
    asks: `market:${marketId}:${outcomeString}:asks`, // Satış emirleri (Sorted Set)
  };
};

class OrderService {
  async createOrder(orderData) {
    let { userId, marketId, type, outcome, quantity, price } = orderData;

    const t = await sequelize.transaction();

    try {
      // --- Temel Kontroller ---
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');
      
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!user) throw new Error('Kullanıcı bulunamadı.');
      
      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);

      if (type === 'BUY') {
        // --- ALIŞ EMRİ MANTIĞI ---
        const totalCost = quantity * price;
        if (user.balance < totalCost) throw new Error('Yetersiz bakiye.');
        user.balance -= totalCost;
        await user.save({ transaction: t });

        // EŞLEŞTİRME: Redis'teki en ucuz satış emirlerini bul
        const matchingSellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);
        
        for (const sellOrder of matchingSellOrders) {
          if (quantity === 0) break;
          const sellPrice = sellOrder.score;
          const [sellerOrderId, sellerOrderQuantity] = sellOrder.value.split(':');
          
          if (sellPrice <= price) {
            const tradeQuantity = Math.min(quantity, parseInt(sellerOrderQuantity));
            
            // --- TİCARETİ GERÇEKLEŞTİR ---
            await this.executeTrade(t, buyerId, sellerOrderId, marketId, outcome, tradeQuantity, sellPrice);
            
            quantity -= tradeQuantity; // Kalan miktarı güncelle

            // Eşleşen emri Redis'ten güncelle/sil
            const remainingSellerQty = parseInt(sellerOrderQuantity) - tradeQuantity;
            if (remainingSellerQty === 0) {
              await redisClient.zRem(asksKey, sellOrder.value);
              await Order.update({ status: 'FILLED' }, { where: { id: sellerOrderId }, transaction: t });
            } else {
              await redisClient.zRem(asksKey, sellOrder.value);
              await redisClient.zAdd(asksKey, { score: sellPrice, value: `${sellerOrderId}:${remainingSellerQty}` });
            }
          }
        }
      } 
      // ... (SELL mantığı da benzer şekilde güncellenecek)

      // Eğer emir tam eşleşmediyse, kalanı deftere yaz
      if (quantity > 0) {
        const remainingOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        const redisKey = type === 'BUY' ? bidsKey : asksKey;
        await redisClient.zAdd(redisKey, { score: price, value: `${remainingOrder.id}:${quantity}` });
        
        await t.commit();
        return { message: "Emriniz kısmen eşleşti veya deftere yazıldı.", order: remainingOrder };
      } else {
        await t.commit();
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // --- YENİ YARDIMCI TİCARET FONKSİYONU ---
  async executeTrade(t, buyerId, sellerOrderId, marketId, outcome, quantity, price) {
      const sellerOrder = await Order.findByPk(sellerOrderId, { transaction: t });
      const buyer = await User.findByPk(buyerId, { lock: t.LOCK.UPDATE, transaction: t });
      const seller = await User.findByPk(sellerOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

      const tradeTotal = quantity * price;

      // Satıcının bakiyesini artır
      seller.balance += tradeTotal;
      await seller.save({ transaction: t });

      // Alıcının hisselerini artır
      const buyerShare = await Share.findOne({ where: { userId: buyerId, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyerId, marketId, outcome, quantity: 0 }, { transaction: t });
      buyerShare.quantity += quantity;
      await buyerShare.save({ transaction: t });
      
      // Satıcının hisselerinin önceden kilitlendiğini varsayıyoruz (SELL mantığında eklenecek)
  }
}

module.exports = new OrderService();