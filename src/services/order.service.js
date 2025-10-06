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
    const initialQuantity = quantity;

    const t = await sequelize.transaction();

    try {
      // --- Temel Kontroller ---
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');
      
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!user) throw new Error('Kullanıcı bulunamadı.');
      
      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);

      if (type === 'BUY') {
        const totalCost = quantity * price;
        if (user.balance < totalCost) throw new Error('Yetersiz bakiye.');
        
        user.balance -= totalCost;
        await user.save({ transaction: t });

        // --- YENİ EŞLEŞTİRME MANTIĞI (REDIS ÜZERİNDE) ---
        // Uygun satış emirlerini Redis'ten bul (en ucuzdan pahalıya doğru)
        const matchingSellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);
        
        for (const sellOrder of matchingSellOrders) {
          if (quantity === 0) break;
          const sellPrice = sellOrder.score;
          const [sellerOrderId, sellerOrderQuantityStr] = sellOrder.value.split(':');
          const sellerOrderQuantity = parseInt(sellerOrderQuantityStr);
          
          if (sellPrice <= price) {
            const tradeQuantity = Math.min(quantity, sellerOrderQuantity);
            
            // --- TİCARETİ GERÇEKLEŞTİR ---
            await this.executeTrade(t, userId, sellerOrderId, marketId, outcome, tradeQuantity, sellPrice);
            
            quantity -= tradeQuantity; // Alıcının kalan miktarını güncelle

            // Eşleşen emri Redis'ten ve PostgreSQL'den güncelle/sil
            const remainingSellerQty = sellerOrderQuantity - tradeQuantity;
            if (remainingSellerQty === 0) {
              await redisClient.zRem(asksKey, sellOrder.value);
              await Order.update({ status: 'FILLED' }, { where: { id: sellerOrderId }, transaction: t });
            } else {
              const newSellerValue = `${sellerOrderId}:${remainingSellerQty}`;
              await redisClient.zRem(asksKey, sellOrder.value);
              await redisClient.zAdd(asksKey, { score: sellPrice, value: newSellerValue });
              await Order.update({ quantity: remainingSellerQty }, { where: { id: sellerOrderId }, transaction: t });
            }
          }
        }
      } else if (type === 'SELL') {
        // ... (SELL mantığı şimdilik eski haliyle kalıyor, bir sonraki adımda bunu da Redis'e taşıyacağız)
        throw new Error("Satış emirleri şu anki güncelleme ile geçici olarak devre dışı.");
      }

      // Eğer emir tam eşleşmediyse, kalanı deftere yaz
      if (quantity > 0) {
        const newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        // Yeni emri Redis'e de ekle
        const redisKey = type === 'BUY' ? bidsKey : asksKey;
        await redisClient.zAdd(redisKey, { score: price, value: `${newOrder.id}:${quantity}` });
        
        await t.commit();
        const message = quantity < initialQuantity ? "Emriniz kısmen eşleşti, kalanı deftere yazıldı." : "Eşleşme bulunamadı, emriniz deftere yazıldı.";
        return { message, order: newOrder };
      } else {
        await t.commit();
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Ticaret gerçekleştirme fonksiyonu (ufak güncellemelerle)
  async executeTrade(t, buyerId, sellerOrderId, marketId, outcome, quantity, price) {
      const sellerOrder = await Order.findByPk(sellerOrderId, { transaction: t });
      const buyer = await User.findByPk(buyerId, { lock: t.LOCK.UPDATE, transaction: t });
      const seller = await User.findByPk(sellerOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

      const tradeTotal = quantity * price;

      seller.balance = parseFloat(seller.balance) + tradeTotal;
      await seller.save({ transaction: t });

      const buyerShare = await Share.findOne({ where: { userId: buyerId, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyerId, marketId, outcome, quantity: 0 }, { transaction: t });
      buyerShare.quantity += quantity;
      await buyerShare.save({ transaction: t });
      
      const sellerShare = await Share.findOne({ where: { userId: seller.id, marketId, outcome }, transaction: t });
      if(sellerShare) {
        sellerShare.quantity -= quantity;
        if (sellerShare.quantity === 0) {
            await sellerShare.destroy({ transaction: t });
        } else {
            await sellerShare.save({ transaction: t });
        }
      }
  }
}

module.exports = new OrderService();