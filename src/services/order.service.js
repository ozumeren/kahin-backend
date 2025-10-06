// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
// --- HATA BURADAYDI: "Share" EKLENDİ ---
const { Order, User, Market, Share, sequelize } = db;

class OrderService {
  async createOrder(orderData) {
    const { userId, marketId, type, outcome, quantity, price } = orderData;

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
      
      let newOrder;

      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        if (buyer.balance < totalCost) throw new Error('Yetersiz bakiye.');
        
        buyer.balance -= totalCost;
        await buyer.save({ transaction: t });

        const matchingSellOrder = await Order.findOne({
          where: {
            marketId, type: 'SELL', outcome, status: 'OPEN',
            price: { [Op.lte]: price },
            quantity: quantity,
            userId: { [Op.ne]: userId }
          },
          order: [['price', 'ASC']],
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (matchingSellOrder) {
          console.log('Alış emri için eşleşme bulundu!');
          const seller = await User.findByPk(matchingSellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

          seller.balance += quantity * matchingSellOrder.price;
          await seller.save({ transaction: t });

          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += quantity;
          await buyerShare.save({ transaction: t });
          
          matchingSellOrder.status = 'FILLED';
          await matchingSellOrder.save({ transaction: t });

          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'FILLED' }, { transaction: t });
        } else {
          console.log('Alış emri için eşleşme bulunamadı, emir deftere yazılıyor.');
          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        }
        
      } else if (type === 'SELL') {
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw new Error('Satmak için yeterli hisseniz yok.');
        }

        sellerShare.quantity -= quantity;
        await sellerShare.save({ transaction: t });

        const matchingBuyOrder = await Order.findOne({
          where: {
            marketId, type: 'BUY', outcome, status: 'OPEN',
            price: { [Op.gte]: price },
            quantity: quantity,
            userId: { [Op.ne]: userId }
          },
          order: [['price', 'DESC']],
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (matchingBuyOrder) {
          console.log('Satış emri için eşleşme bulundu!');
          const buyer = await User.findByPk(matchingBuyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
          
          seller.balance += quantity * matchingBuyOrder.price;
          await seller.save({ transaction: t });

          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += quantity;
          await buyerShare.save({ transaction: t });

          matchingBuyOrder.status = 'FILLED';
          await matchingBuyOrder.save({ transaction: t });

          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'FILLED' }, { transaction: t });
        } else {
          console.log('Satış emri için eşleşme bulunamadı, emir deftere yazılıyor.');
          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        }
        
      } else {
        throw new Error('Geçersiz emir tipi.');
      }
      
      await t.commit();
      return newOrder;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new OrderService();