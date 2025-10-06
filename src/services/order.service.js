// src/services/order.service.js
// ... (tüm importlar aynı)
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;


class OrderService {
  async createOrder(orderData) {
    // ... (tüm kod aynı, sadece bakiye hesaplamaları değişecek)
    let { userId, marketId, type, outcome, quantity, price } = orderData;

    const t = await sequelize.transaction();

    try {
      if (!marketId || !type || outcome === null || !quantity || !price) {
        throw new Error('Eksik bilgi: marketId, type, outcome, quantity ve price zorunludur.');
      }
      if (price <= 0 || price >= 1) {
        throw new Error('Fiyat 0 ile 1 arasında olmalıdır.');
      }
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');
      
      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        if (buyer.balance < totalCost) throw new Error('Yetersiz bakiye.');
        
        buyer.balance -= totalCost;
        
        const matchingSellOrders = await Order.findAll({
            where: { marketId, type: 'SELL', outcome, status: 'OPEN', price: { [Op.lte]: price }, userId: { [Op.ne]: userId } },
            order: [['price', 'ASC'], ['createdAt', 'ASC']],
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        for (const sellOrder of matchingSellOrders) {
            if (quantity === 0) break;
            const tradeQuantity = Math.min(quantity, sellOrder.quantity);
            const tradePrice = sellOrder.price;
            const tradeTotal = tradeQuantity * tradePrice;
            const priceDifference = price - tradePrice;

            if (priceDifference > 0) {
                // DÜZELTME: Yuvarlama eklendi
                const newBuyerBalance = parseFloat(buyer.balance) + (tradeQuantity * priceDifference);
                buyer.balance = parseFloat(newBuyerBalance.toFixed(2));
            }

            const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
            // DÜZELTME: Yuvarlama eklendi
            const newSellerBalance = parseFloat(seller.balance) + tradeTotal;
            seller.balance = parseFloat(newSellerBalance.toFixed(2));
            await seller.save({ transaction: t });

            const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            quantity -= tradeQuantity;
            sellOrder.quantity -= tradeQuantity;
            if (sellOrder.quantity === 0) sellOrder.status = 'FILLED';
            await sellOrder.save({ transaction: t });
        }
        await buyer.save({ transaction: t });

      } else if (type === 'SELL') {
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) throw new Error('Satmak için yeterli hisseniz yok.');
        
        sellerShare.quantity -= quantity;
        await sellerShare.save({ transaction: t });
        
        const matchingBuyOrders = await Order.findAll({
            where: { marketId, type: 'BUY', outcome, status: 'OPEN', price: { [Op.gte]: price }, userId: { [Op.ne]: userId } },
            order: [['price', 'DESC'], ['createdAt', 'ASC']],
            lock: t.LOCK.UPDATE,
            transaction: t
        });

        for (const buyOrder of matchingBuyOrders) {
            if (quantity === 0) break;
            const tradeQuantity = Math.min(quantity, buyOrder.quantity);
            const tradePrice = buyOrder.price;
            const tradeTotal = tradeQuantity * tradePrice;
            
            // DÜZELTME: Yuvarlama eklendi
            const newSellerBalance = parseFloat(seller.balance) + tradeTotal;
            seller.balance = parseFloat(newSellerBalance.toFixed(2));

            const buyer = await User.findByPk(buyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
            const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            const priceDifference = tradePrice - price;
            if(priceDifference > 0) {
                // DÜZELTME: Yuvarlama eklendi
                const newBuyerBalance = parseFloat(buyer.balance) + (tradeQuantity * priceDifference);
                buyer.balance = parseFloat(newBuyerBalance.toFixed(2));
                await buyer.save({transaction: t});
            }

            quantity -= tradeQuantity;
            buyOrder.quantity -= tradeQuantity;
            if (buyOrder.quantity === 0) buyOrder.status = 'FILLED';
            await buyOrder.save({ transaction: t });
        }
        await seller.save({ transaction: t });
      }
      
      await t.commit(); // Transaction'ı burada onayla

      if (quantity === 0) {
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      } 
      
      const remainingOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' });

      if (quantity < orderData.quantity) {
        return { message: "Emriniz kısmen eşleşti, kalanı deftere yazıldı.", order: remainingOrder };
      } else {
        return { message: "Eşleşme bulunamadı, emriniz deftere yazıldı.", order: remainingOrder };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new OrderService();