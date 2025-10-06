// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;

class OrderService {
  async createOrder(orderData) {
    // ... (kodun başlangıcı aynı kalıyor)
    let { userId, marketId, type, outcome, quantity, price } = orderData;
    const initialQuantity = quantity;
    const t = await sequelize.transaction();
    try {
      // ... (kontroller aynı kalıyor)
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');
      
      if (type === 'BUY') {
        // ... (BUY emri mantığının başlangıcı aynı kalıyor)
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        if (buyer.balance < totalCost) throw new Error('Yetersiz bakiye.');
        buyer.balance -= totalCost;
        
        const matchingSellOrders = await Order.findAll({ /* ... (sorgu aynı) */ });

        for (const sellOrder of matchingSellOrders) {
          if (quantity === 0) break;
          const tradeQuantity = Math.min(quantity, sellOrder.quantity);
          const tradePrice = sellOrder.price;
          const tradeTotal = tradeQuantity * tradePrice;

          const priceDifference = price - tradePrice;
          if (priceDifference > 0) {
            buyer.balance += tradeQuantity * priceDifference;
          }

          const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
          seller.balance = parseFloat(seller.balance) + tradeTotal;
          await seller.save({ transaction: t });

          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += tradeQuantity;
          await buyerShare.save({ transaction: t });
          
          // --- DÜZELTME VE YENİ KOD (Satıcının hissesini düşür ve 0 ise sil) ---
          const sellerShare = await Share.findOne({ where: { userId: seller.id, marketId, outcome }, transaction: t });
          if (sellerShare) {
            sellerShare.quantity -= tradeQuantity;
            if (sellerShare.quantity === 0) {
              await sellerShare.destroy({ transaction: t }); // Miktar 0 ise kaydı sil
            } else {
              await sellerShare.save({ transaction: t });
            }
          }
          // -----------------------------------------------------------------
          
          quantity -= tradeQuantity;
          sellOrder.quantity -= tradeQuantity;
          if (sellOrder.quantity === 0) sellOrder.status = 'FILLED';
          await sellOrder.save({ transaction: t });
        }
        await buyer.save({ transaction: t });

      } else if (type === 'SELL') {
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw new Error('Satmak için yeterli hisseniz yok.');
        }

        // DİKKAT: Hisse kilitleme işlemi artık döngünün içinde yapılacak. Buradan kaldırıyoruz.
        // sellerShare.quantity -= quantity; 
        // await sellerShare.save({ transaction: t });
        
        const matchingBuyOrders = await Order.findAll({ /* ... (sorgu aynı) */ });

        for (const buyOrder of matchingBuyOrders) {
            if (quantity === 0) break;
            const tradeQuantity = Math.min(quantity, buyOrder.quantity);
            const tradePrice = buyOrder.price;
            const tradeTotal = tradeQuantity * tradePrice;
            
            const newSellerBalance = parseFloat(seller.balance) + tradeTotal;
            seller.balance = parseFloat(newSellerBalance.toFixed(2));

            const buyer = await User.findByPk(buyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
            const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            // --- DÜZELTME VE YENİ KOD (Satıcının hissesini düşür ve 0 ise sil) ---
            sellerShare.quantity -= tradeQuantity;
            // -----------------------------------------------------------------

            // ... (para iadesi kodu aynı)

            quantity -= tradeQuantity;
            buyOrder.quantity -= tradeQuantity;
            if (buyOrder.quantity === 0) buyOrder.status = 'FILLED';
            await buyOrder.save({ transaction: t });
        }
        
        // --- YENİ KOD (Satıcının hisse kaydını döngüden sonra güncelle/sil) ---
        if (sellerShare.quantity === 0) {
            await sellerShare.destroy({ transaction: t });
        } else {
            await sellerShare.save({ transaction: t });
        }
        // ---------------------------------------------------------------------
        await seller.save({ transaction: t });
      }
      
      // ... (kodun sonu aynı kalıyor)
      await t.commit();
      // ... (return ifadeleri)

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}
module.exports = new OrderService();