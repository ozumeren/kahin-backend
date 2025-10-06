// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;

class OrderService {
  async createOrder(orderData) {
    let { userId, marketId, type, outcome, quantity, price } = orderData;

    const t = await sequelize.transaction();

    try {
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');
      
      let newOrder;

      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        if (buyer.balance < totalCost) throw new Error('Yetersiz bakiye.');
        
        buyer.balance -= totalCost;
        await buyer.save({ transaction: t });

        const matchingSellOrders = await Order.findAll({
          where: {
            marketId, type: 'SELL', outcome, status: 'OPEN',
            price: { [Op.lte]: price },
            userId: { [Op.ne]: userId }
          },
          order: [['price', 'ASC'], ['createdAt', 'ASC']],
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        for (const sellOrder of matchingSellOrders) {
          if (quantity === 0) break;
          
          const tradeQuantity = Math.min(quantity, sellOrder.quantity);
          const sellPrice = sellOrder.score; // Bu satırda bir hata olabilir, Redis'ten gelmiyor. Düzeltelim.
          const tradePrice = sellOrder.price; // Doğrusu bu olmalı.

          // --- YENİ YARDIMCI TİCARET FONKSİYONU ÇAĞRISI (DÜZELTİLDİ) ---
          // Hatalı: await this.executeTrade(t, buyerId, ...);
          // Doğru: Alıcının ID'si olarak "userId" değişkenini kullanıyoruz.
          await this.executeTrade(t, userId, sellOrder.id, marketId, outcome, tradeQuantity, tradePrice);
          
          quantity -= tradeQuantity;

          sellOrder.quantity -= tradeQuantity;
          if (sellOrder.quantity === 0) {
            sellOrder.status = 'FILLED';
          }
          await sellOrder.save({ transaction: t });
        }
        
      } else if (type === 'SELL') {
        // ... (Satış emri mantığı)
        throw new Error("Satış emirleri henüz tam olarak desteklenmiyor.");
      }
      
      if (quantity > 0) {
        const remainingOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        await t.commit();
        return { message: "Emriniz kısmen eşleşti, kalanı deftere yazıldı.", order: remainingOrder };
      } else {
        await t.commit();
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

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
  }
}

module.exports = new OrderService();