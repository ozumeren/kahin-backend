// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');
const marketService = require('./market.service');

const getMarketKeys = (marketId, outcome) => {
  const outcomeString = outcome ? 'yes' : 'no';
  return {
    bids: `market:${marketId}:${outcomeString}:bids`,
    asks: `market:${marketId}:${outcomeString}:asks`,
  };
};

class OrderService {
  async createOrder(orderData) {
    let { userId, marketId, type, outcome, quantity, price } = orderData;
    const initialQuantity = quantity;
    const t = await sequelize.transaction();

    try {
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Pazar işlem için açık değil.');
      
      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);
      
      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        
        if (buyer.balance < totalCost) {
          throw ApiError.badRequest('Yetersiz bakiye.');
        }
        
        buyer.balance -= totalCost;

        // 🔥 BUY emri için Transaction kaydı oluştur
        await Transaction.create({
          userId,
          marketId,
          type: 'bet',
          amount: -totalCost,
          description: `${outcome ? 'YES' : 'NO'} için ${quantity} adet BUY emri (fiyat: ${price})`
        }, { transaction: t });
        
        const matchingSellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);
        
        for (const sellOrderData of matchingSellOrders) {
          if (quantity === 0) break;
          const sellPrice = sellOrderData.score;
          const [sellerOrderId, sellerOrderQuantityStr] = sellOrderData.value.split(':');
          const sellerOrderQuantity = parseInt(sellerOrderQuantityStr);
          
          if (sellPrice <= price) {
            const tradeQuantity = Math.min(quantity, sellerOrderQuantity);
            const tradeTotal = tradeQuantity * sellPrice;

            const priceDifference = price - sellPrice;
            if (priceDifference > 0) {
              buyer.balance += tradeQuantity * priceDifference;
            }
            
            const sellOrder = await Order.findByPk(sellerOrderId, { transaction: t });
            const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
            seller.balance = parseFloat(seller.balance) + tradeTotal;
            await seller.save({ transaction: t });

            // 🔥 Satıcı için Transaction (payout)
            await Transaction.create({
              userId: seller.id,
              marketId,
              type: 'payout',
              amount: tradeTotal,
              description: `${tradeQuantity} adet ${outcome ? 'YES' : 'NO'} hissesi satışı (fiyat: ${sellPrice})`
            }, { transaction: t });

            const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            const sellerShare = await Share.findOne({ where: { userId: seller.id, marketId, outcome }, transaction: t });
            if (sellerShare) {
              sellerShare.quantity -= tradeQuantity;
              if (sellerShare.quantity === 0) await sellerShare.destroy({ transaction: t });
              else await sellerShare.save({ transaction: t });
            }
            
            quantity -= tradeQuantity;
            const remainingSellerQty = sellerOrderQuantity - tradeQuantity;
            await redisClient.zRem(asksKey, sellOrderData.value);
            if (remainingSellerQty > 0) {
              await redisClient.zAdd(asksKey, { score: sellPrice, value: `${sellerOrderId}:${remainingSellerQty}` });
              await Order.update({ quantity: remainingSellerQty }, { where: { id: sellerOrderId }, transaction: t });
            } else {
              await Order.update({ status: 'FILLED' }, { where: { id: sellerOrderId }, transaction: t });
            }
          }
        }
        await buyer.save({ transaction: t });

      } else if (type === 'SELL') {
        // --- SATIŞ EMRİ MANTIĞI ---
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw ApiError.badRequest('Satmak için yeterli hisseniz yok.');
        }

        sellerShare.quantity -= quantity;

        // 🔥 SELL emri için Transaction kaydı (hisse kilitlendi)
        await Transaction.create({
          userId,
          marketId,
          type: 'bet',
          amount: 0, // Henüz para kazanılmadı, sadece hisse kilitlendi
          description: `${quantity} adet ${outcome ? 'YES' : 'NO'} hissesi SELL emrine kilitlendi (fiyat: ${price})`
        }, { transaction: t });
        
        const matchingBuyOrders = await redisClient.zRangeWithScores(bidsKey, 0, -1, { REV: true });

        for (const buyOrderData of matchingBuyOrders) {
            if (quantity === 0) break;
            const buyPrice = buyOrderData.score;
            const [buyerOrderId, buyerOrderQuantityStr] = buyOrderData.value.split(':');
            const buyerOrderQuantity = parseInt(buyerOrderQuantityStr);

            if (buyPrice >= price) {
              const tradeQuantity = Math.min(quantity, buyerOrderQuantity);
              const tradeTotal = tradeQuantity * buyPrice;

              seller.balance = parseFloat(seller.balance) + tradeTotal;

              // 🔥 Satıcı için Transaction (payout)
              await Transaction.create({
                userId: seller.id,
                marketId,
                type: 'payout',
                amount: tradeTotal,
                description: `${tradeQuantity} adet ${outcome ? 'YES' : 'NO'} hissesi satışı (fiyat: ${buyPrice})`
              }, { transaction: t });

              const buyOrder = await Order.findByPk(buyerOrderId, { transaction: t });
              const buyer = await User.findByPk(buyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
              const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
              buyerShare.quantity += tradeQuantity;
              await buyerShare.save({ transaction: t });
              
              const priceDifference = buyPrice - price;
              if(priceDifference > 0) {
                  const refund = tradeQuantity * priceDifference;
                  buyer.balance = parseFloat(buyer.balance) + refund;
                  await buyer.save({transaction: t});
              }

              quantity -= tradeQuantity;
              const remainingBuyerQty = buyerOrderQuantity - tradeQuantity;
              await redisClient.zRem(bidsKey, buyOrderData.value);
              if (remainingBuyerQty > 0) {
                  await redisClient.zAdd(bidsKey, { score: buyPrice, value: `${buyerOrderId}:${remainingBuyerQty}` });
                  await Order.update({ quantity: remainingBuyerQty }, { where: { id: buyerOrderId }, transaction: t });
              } else {
                  await Order.update({ status: 'FILLED' }, { where: { id: buyerOrderId }, transaction: t });
              }
            }
        }
        
        if (sellerShare.quantity === 0) await sellerShare.destroy({ transaction: t });
        else await sellerShare.save({ transaction: t });
        
        await seller.save({ transaction: t });
      }
      
      await t.commit(); 

      // WebSocket üzerinden order book güncellemesi gönder
      await this.notifyOrderBookUpdate(marketId);

      if (quantity === 0) {
        return { message: "Emir tamamen eşleşti ve tamamlandı." };
      } 
      
      const newOrder = await Order.findOne({ where: {userId, marketId, type, outcome, status: 'OPEN'} });
      if (newOrder) {
        newOrder.quantity += quantity;
        newOrder.price = price;
        await newOrder.save();
        await redisClient.zAdd(type === 'BUY' ? bidsKey : asksKey, { score: price, value: `${newOrder.id}:${newOrder.quantity}` }, { XX: true });
        return { message: "Açık emriniz güncellendi.", order: newOrder};
      }
      const remainingOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' });
      await redisClient.zAdd(type === 'BUY' ? bidsKey : asksKey, { score: price, value: `${remainingOrder.id}:${quantity}` });

      if (quantity < initialQuantity) {
        return { message: "Emriniz kısmen eşleşti, kalanı deftere yazıldı.", order: remainingOrder };
      } else {
        return { message: "Eşleşme bulunamadı, emriniz deftere yazıldı.", order: remainingOrder };
      }

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async cancelOrder(orderId, userId) {
    const t = await sequelize.transaction();

    try {
      // 1. Emri bul
      const order = await Order.findByPk(orderId, { transaction: t });

      if (!order) {
        throw ApiError.notFound('Emir bulunamadı.');
      }

      // 2. Emrin sahibi kontrolü
      if (order.userId !== userId) {
        throw ApiError.forbidden('Bu emri iptal etme yetkiniz yok.');
      }

      // 3. Emir durumu kontrolü
      if (order.status !== 'OPEN') {
        throw ApiError.badRequest('Sadece açık emirler iptal edilebilir.');
      }

      // 4. Market kontrolü
      const market = await Market.findByPk(order.marketId, { transaction: t });
      if (!market) {
        throw ApiError.notFound('Pazar bulunamadı.');
      }

      // 5. Redis'ten emri sil
      const outcomeString = order.outcome ? 'yes' : 'no';
      const orderType = order.type === 'BUY' ? 'bids' : 'asks';
      const redisKey = `market:${order.marketId}:${outcomeString}:${orderType}`;

      // Redis'teki tüm emirleri tara ve bu emri bul
      const allOrders = await redisClient.zRangeWithScores(redisKey, 0, -1);
      for (const redisOrder of allOrders) {
        if (redisOrder.value.startsWith(`${orderId}:`)) {
          await redisClient.zRem(redisKey, redisOrder.value);
          break;
        }
      }

      // 6. Eğer BUY emriyse, kilitli parayı iade et
      if (order.type === 'BUY') {
        const user = await User.findByPk(userId, { 
          lock: t.LOCK.UPDATE, 
          transaction: t 
        });

        const refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction: t });

        // 🔥 Para iadesi için Transaction kaydı
        await Transaction.create({
          userId,
          marketId: order.marketId,
          type: 'refund',
          amount: refundAmount,
          description: `BUY emri iptal edildi: ${order.quantity} adet x ${order.price} = ${refundAmount} TL iade`
        }, { transaction: t });
      }

      // 7. Eğer SELL emriyse, kilitli hisseleri iade et
      if (order.type === 'SELL') {
        let share = await Share.findOne({
          where: {
            userId,
            marketId: order.marketId,
            outcome: order.outcome
          },
          transaction: t
        });

        if (!share) {
          // Hisse kaydı yoksa yeni oluştur
          share = await Share.create({
            userId,
            marketId: order.marketId,
            outcome: order.outcome,
            quantity: order.quantity
          }, { transaction: t });
        } else {
          // Varsa miktarı artır
          share.quantity = parseInt(share.quantity) + parseInt(order.quantity);
          await share.save({ transaction: t });
        }

        // 🔥 Hisse iadesi için Transaction kaydı
        await Transaction.create({
          userId,
          marketId: order.marketId,
          type: 'refund',
          amount: 0,
          description: `SELL emri iptal edildi: ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} hissesi iade`
        }, { transaction: t });
      }

      // 8. Emri iptal edildi olarak işaretle
      order.status = 'CANCELLED';
      await order.save({ transaction: t });

      await t.commit();

      // 🔥 İptal işlemi sonrası WebSocket güncellemesi
      await this.publishOrderBookUpdate(order.marketId);

      return {
        message: 'Emir başarıyla iptal edildi.',
        cancelledOrder: order
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // 🔥 YENİ EKLENEN FONKSİYON
  async publishOrderBookUpdate(marketId) {
    try {
      // Güncel order book'u al
      const orderBook = await marketService.getOrderBook(marketId);
      
      // WebSocket üzerinden yayınla
      await websocketServer.publishOrderBookUpdate(marketId, orderBook);
      
      console.log(`📡 Order book güncellendi ve WebSocket'e gönderildi: ${marketId}`);
    } catch (error) {
      console.error(`WebSocket order book güncelleme hatası (Market: ${marketId}):`, error.message);
    }
  }

  async getUserOrders(userId, filters = {}) {
    const where = { userId };

    // Status filtresi (OPEN, FILLED, CANCELLED)
    if (filters.status) {
      where.status = filters.status;
    }

    // Market filtresi
    if (filters.marketId) {
      where.marketId = filters.marketId;
    }

    // Order type filtresi (BUY, SELL)
    if (filters.type) {
      where.type = filters.type;
    }

    const orders = await Order.findAll({
      where,
      include: [
        {
          model: Market,
          attributes: ['id', 'title', 'status']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return orders;
  }
}

module.exports = new OrderService();