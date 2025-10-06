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
        
        // Alıcının parasını "kilitle"
        buyer.balance -= totalCost;
        await buyer.save({ transaction: t });

        // Uygun satış emirlerini bul (en ucuzdan pahalıya doğru)
        const matchingSellOrders = await Order.findAll({
          where: {
            marketId, type: 'SELL', outcome, status: 'OPEN',
            price: { [Op.lte]: price },
            userId: { [Op.ne]: userId }
          },
          order: [['price', 'ASC']],
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        for (const sellOrder of matchingSellOrders) {
          if (quantity === 0) break; // Alınacak miktar bittiyse döngüden çık

          const tradeQuantity = Math.min(quantity, sellOrder.quantity); // Eşleşecek miktar
          const tradePrice = sellOrder.price; // Eşleşme her zaman defterdeki emrin fiyatından olur
          const tradeTotal = tradeQuantity * tradePrice;

          // Alıcıya, daha iyi bir fiyattan (daha ucuza) aldığı için para iadesi yap (varsa)
          const priceDifference = price - tradePrice;
          if (priceDifference > 0) {
            buyer.balance += tradeQuantity * priceDifference;
            await buyer.save({ transaction: t });
          }

          // Satıcıyı bul ve parasını ver
          const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
          seller.balance += tradeTotal;
          await seller.save({ transaction: t });

          // Alıcının hisselerini artır
          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += tradeQuantity;
          await buyerShare.save({ transaction: t });
          
          // Alış ve satış emirlerini güncelle
          quantity -= tradeQuantity;
          sellOrder.quantity -= tradeQuantity;

          if (sellOrder.quantity === 0) {
            sellOrder.status = 'FILLED';
          }
          await sellOrder.save({ transaction: t });
        }

      } else if (type === 'SELL') {
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw new Error('Satmak için yeterli hisseniz yok.');
        }

        // Satıcının hisselerini "kilitle"
        sellerShare.quantity -= quantity;
        await sellerShare.save({ transaction: t });
        
        // TODO: Alış emirleriyle eşleştirme mantığı buraya eklenecek (BUY ile simetrik)
      }

      // Eğer emrin tamamı eşleşmediyse, kalanı deftere yaz
      if (quantity > 0) {
        const remainingOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        await t.commit();
        return remainingOrder;
      } else {
        await t.commit();
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new OrderService();