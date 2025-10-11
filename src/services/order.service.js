// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, Transaction, Trade, sequelize } = db;
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
      // ========== PHASE 1: VALIDATIONS ==========
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Pazar işlem için açık değil.');
      
      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);
      
      // ✅ Eşleşen emirleri takip etmek için (tüm tipler için tanımla)
      const filledOrders = new Map(); // SELL emirleri için (BUY ile eşleşenler)
      const filledBuyOrders = new Map(); // BUY emirleri için (SELL ile eşleşenler)
      
      // ✅ YENİ: Eğer BUY emri varsa, önce order oluştur
      let newBuyOrder = null;
      
      // ========== PHASE 2: ORDER PROCESSING ==========
      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const totalCost = quantity * price;
        
        if (buyer.balance < totalCost) {
          throw ApiError.badRequest('Yetersiz bakiye.');
        }
        
        // Para çek
        buyer.balance -= totalCost;
        await buyer.save({ transaction: t });

        // ✅ YENİ: Önce BUY order'ı oluştur (eşleşme öncesi)
        newBuyOrder = await Order.create({ 
          userId, 
          marketId, 
          type: 'BUY', 
          outcome, 
          quantity, 
          price, 
          status: 'OPEN' 
        }, { transaction: t });

        let actualSpent = 0;
        
        // Eşleşme kontrolü
        const matchingSellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);
        
        for (const sellOrderData of matchingSellOrders) {
          if (quantity === 0) break;
          const sellPrice = sellOrderData.score;
          const [sellerOrderId, sellerOrderQuantityStr] = sellOrderData.value.split(':');
          const sellerOrderQuantity = parseInt(sellerOrderQuantityStr);
          
          if (sellPrice <= price) {
            const tradeQuantity = Math.min(quantity, sellerOrderQuantity);
            const tradeTotal = tradeQuantity * sellPrice;
            
            actualSpent += tradeTotal;

            // Fiyat farkı iadesi
            const priceDifference = price - sellPrice;
            if (priceDifference > 0) {
              const refundAmount = tradeQuantity * priceDifference;
              buyer.balance += refundAmount;
              await buyer.save({ transaction: t });
            }
            
            // Satıcı işlemleri
            const sellOrder = await Order.findByPk(sellerOrderId, { transaction: t });
            const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
            seller.balance = parseFloat(seller.balance) + tradeTotal;
            await seller.save({ transaction: t });

            // ✅ DÜZELTME: Artık doğru order ID'leri kullanıyoruz
            await Trade.create({
              buyerId: buyer.id,
              buyOrderId: newBuyOrder.id, // ✅ Doğru order ID
              sellerId: seller.id,
              sellOrderId: sellerOrderId, // ✅ Doğru order ID
              marketId,
              outcome,
              quantity: tradeQuantity,
              price: sellPrice,
              total: tradeTotal,
              tradeType: 'LIMIT'
            }, { transaction: t });

            console.log(`✅ Trade kaydı oluşturuldu: ${tradeQuantity} adet @ ${sellPrice} TL`);

            // 🆕 Yeni trade bildirimi gönder
            try {
              await websocketServer.publishNewTrade(marketId, {
                tradeId: newBuyOrder.id, // Trade ID olarak order ID kullanılabilir
                buyerId: buyer.id,
                sellerId: seller.id,
                outcome,
                quantity: tradeQuantity,
                price: sellPrice,
                total: tradeTotal,
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              console.error('New trade WebSocket bildirimi hatası:', error.message);
            }

            // Satıcı transaction
            await Transaction.create({
              userId: seller.id,
              marketId,
              type: 'payout',
              amount: tradeTotal,
              description: `${tradeQuantity} adet ${outcome ? 'YES' : 'NO'} hissesi satışı (fiyat: ${sellPrice})`
            }, { transaction: t });

            // Satıcının emir dolum bilgisini topla
            if (!filledOrders.has(sellerOrderId)) {
              filledOrders.set(sellerOrderId, {
                userId: seller.id,
                orderId: sellerOrderId,
                filledQuantity: 0,
                originalQuantity: sellerOrderQuantity + (sellerOrderQuantity - parseInt(sellerOrderQuantityStr)),
                price: sellPrice
              });
            }
            filledOrders.get(sellerOrderId).filledQuantity += tradeQuantity;

            // Hisse transferleri
            const buyerShare = await Share.findOne({ 
              where: { userId: buyer.id, marketId, outcome }, 
              transaction: t 
            }) || await Share.create({ 
              userId: buyer.id, marketId, outcome, quantity: 0 
            }, { transaction: t });
            
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            // Redis güncelle
            quantity -= tradeQuantity;
            const remainingSellerQty = sellerOrderQuantity - tradeQuantity;
            await redisClient.zRem(asksKey, sellOrderData.value);
            
            if (remainingSellerQty > 0) {
              await redisClient.zAdd(asksKey, { 
                score: sellPrice, 
                value: `${sellerOrderId}:${remainingSellerQty}` 
              });
              await Order.update(
                { quantity: remainingSellerQty }, 
                { where: { id: sellerOrderId }, transaction: t }
              );
            } else {
              await Order.update(
                { status: 'FILLED' }, 
                { where: { id: sellerOrderId }, transaction: t }
              );
            }
          }
        }

        // ✅ YENİ: BUY order'ın durumunu güncelle
        if (quantity === 0) {
          // Tamamen eşleşti
          newBuyOrder.status = 'FILLED';
          newBuyOrder.quantity = 0;
          await newBuyOrder.save({ transaction: t });
        } else {
          // Kısmen eşleşti veya hiç eşleşmedi
          newBuyOrder.quantity = quantity;
          await newBuyOrder.save({ transaction: t });
          
          // Redis'e ekle
          await redisClient.zAdd(bidsKey, { 
            score: price, 
            value: `${newBuyOrder.id}:${quantity}` 
          });
        }

        if (actualSpent > 0) {
          await Transaction.create({
            userId,
            marketId,
            type: 'bet',
            amount: -actualSpent,
            description: `${initialQuantity - quantity} adet ${outcome ? 'YES' : 'NO'} hisse alımı (ortalama fiyat: ${(actualSpent / (initialQuantity - quantity)).toFixed(3)})`
          }, { transaction: t });
        }

        if (quantity > 0) {
          const remainingCost = quantity * price;
          await Transaction.create({
            userId,
            marketId,
            type: 'bet',
            amount: -remainingCost,
            description: `${quantity} adet ${outcome ? 'YES' : 'NO'} için BUY emri (fiyat: ${price}) - Defterde bekliyor`
          }, { transaction: t });
        }

      } else if (type === 'SELL') {
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ 
          where: { userId, marketId, outcome }, 
          lock: t.LOCK.UPDATE,
          transaction: t 
        });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw ApiError.badRequest('Satmak için yeterli hisseniz yok.');
        }

        console.log(`🔒 SELL emri oluşturuluyor - Mevcut hisse: ${sellerShare.quantity}, Satılacak: ${quantity}`);
        
        sellerShare.quantity -= quantity;
        await sellerShare.save({ transaction: t });
        
        console.log(`🔒 Hisse kilitlendi - Kalan hisse: ${sellerShare.quantity}`);

        if (sellerShare.quantity === 0) {
          await sellerShare.destroy({ transaction: t });
          console.log(`🗑️ Hisse kaydı silindi (quantity = 0)`);
        }

        // ✅ YENİ: Önce SELL order'ı oluştur (eşleşme öncesi)
        const newSellOrder = await Order.create({ 
          userId, 
          marketId, 
          type: 'SELL', 
          outcome, 
          quantity, 
          price, 
          status: 'OPEN' 
        }, { transaction: t });

        await Transaction.create({
          userId,
          marketId,
          type: 'bet',
          amount: 0,
          description: `${quantity} adet ${outcome ? 'YES' : 'NO'} hissesi SELL emrine kilitlendi (fiyat: ${price})`
        }, { transaction: t });
        
        let initialSellQuantity = quantity;
        
        // Eşleşme kontrolü
        const matchingBuyOrders = await redisClient.zRangeWithScores(bidsKey, 0, -1, { REV: true });

        for (const buyOrderData of matchingBuyOrders) {
          if (quantity === 0) break;
          const buyPrice = buyOrderData.score;
          const [buyerOrderId, buyerOrderQuantityStr] = buyOrderData.value.split(':');
          const buyerOrderQuantity = parseInt(buyerOrderQuantityStr);

          if (buyPrice >= price) {
            const tradeQuantity = Math.min(quantity, buyerOrderQuantity);
            const tradeTotal = tradeQuantity * buyPrice;

            // Satıcıya para ver
            seller.balance = parseFloat(seller.balance) + tradeTotal;
            await seller.save({ transaction: t });

            // Alıcı işlemleri
            const buyOrder = await Order.findByPk(buyerOrderId, { transaction: t });
            const buyer = await User.findByPk(buyOrder.userId, { 
              lock: t.LOCK.UPDATE, 
              transaction: t 
            });

            // ✅ DÜZELTME: Artık doğru order ID'leri kullanıyoruz
            await Trade.create({
              buyerId: buyer.id,
              buyOrderId: buyerOrderId, // ✅ Doğru order ID
              sellerId: seller.id,
              sellOrderId: newSellOrder.id, // ✅ Doğru order ID
              marketId,
              outcome,
              quantity: tradeQuantity,
              price: buyPrice,
              total: tradeTotal,
              tradeType: 'LIMIT'
            }, { transaction: t });

            console.log(`✅ Trade kaydı oluşturuldu: ${tradeQuantity} adet @ ${buyPrice} TL`);

            // 🆕 Yeni trade bildirimi gönder
            try {
              await websocketServer.publishNewTrade(marketId, {
                tradeId: newSellOrder.id, // Trade ID olarak order ID kullanılabilir
                buyerId: buyer.id,
                sellerId: seller.id,
                outcome,
                quantity: tradeQuantity,
                price: buyPrice,
                total: tradeTotal,
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              console.error('New trade WebSocket bildirimi hatası:', error.message);
            }

            // Satıcı transaction
            await Transaction.create({
              userId: seller.id,
              marketId,
              type: 'payout',
              amount: tradeTotal,
              description: `${tradeQuantity} adet ${outcome ? 'YES' : 'NO'} hissesi satışı (fiyat: ${buyPrice})`
            }, { transaction: t });
            
            // Alıcının emir dolum bilgisini topla
            if (!filledBuyOrders.has(buyerOrderId)) {
              filledBuyOrders.set(buyerOrderId, {
                userId: buyer.id,
                orderId: buyerOrderId,
                filledQuantity: 0,
                originalQuantity: buyerOrderQuantity + (buyerOrderQuantity - parseInt(buyerOrderQuantityStr)),
                price: buyPrice
              });
            }
            filledBuyOrders.get(buyerOrderId).filledQuantity += tradeQuantity;
            
            const buyerShare = await Share.findOne({ 
              where: { userId: buyer.id, marketId, outcome }, 
              transaction: t 
            }) || await Share.create({ 
              userId: buyer.id, marketId, outcome, quantity: 0 
            }, { transaction: t });
            
            buyerShare.quantity += tradeQuantity;
            await buyerShare.save({ transaction: t });
            
            // Fiyat farkı iadesi
            const priceDifference = buyPrice - price;
            if (priceDifference > 0) {
              const refund = tradeQuantity * priceDifference;
              buyer.balance = parseFloat(buyer.balance) + refund;
              await buyer.save({ transaction: t });
            }

            // Redis güncelle
            quantity -= tradeQuantity;
            const remainingBuyerQty = buyerOrderQuantity - tradeQuantity;
            await redisClient.zRem(bidsKey, buyOrderData.value);
            
            if (remainingBuyerQty > 0) {
              await redisClient.zAdd(bidsKey, { 
                score: buyPrice, 
                value: `${buyerOrderId}:${remainingBuyerQty}` 
              });
              await Order.update(
                { quantity: remainingBuyerQty }, 
                { where: { id: buyerOrderId }, transaction: t }
              );
            } else {
              await Order.update(
                { status: 'FILLED' }, 
                { where: { id: buyerOrderId }, transaction: t }
              );
            }
          }
        }

        // ✅ YENİ: SELL order'ın durumunu güncelle
        if (quantity === 0) {
          // Tamamen eşleşti
          newSellOrder.status = 'FILLED';
          newSellOrder.quantity = 0;
          await newSellOrder.save({ transaction: t });
        } else {
          // Kısmen eşleşti veya hiç eşleşmedi
          newSellOrder.quantity = quantity;
          await newSellOrder.save({ transaction: t });
          
          // Redis'e ekle
          await redisClient.zAdd(asksKey, { 
            score: price, 
            value: `${newSellOrder.id}:${quantity}` 
          });
        }
        
        console.log(`✅ SELL eşleşmesi tamamlandı - Eşleşen: ${initialSellQuantity - quantity}, Kalan: ${quantity}`);
      }

      // 🆕 WebSocket bildirimleri için gerekli verileri transaction içinde topla
      const wsNotifications = [];

      // SELL emri için alıcı bildirimlerini hazırla
      if (type === 'SELL' && filledBuyOrders && filledBuyOrders.size > 0) {
        for (const [orderId, info] of filledBuyOrders.entries()) {
          const buyOrder = await Order.findByPk(orderId, { transaction: t });
          wsNotifications.push({
            type: 'order_filled',
            userId: info.userId,
            data: {
              orderId: orderId,
              marketId,
              marketTitle: market.title,
              orderType: 'BUY',
              outcome,
              originalQuantity: info.originalQuantity,
              filledQuantity: info.filledQuantity,
              remainingQuantity: buyOrder.quantity,
              price: info.price,
              avgFillPrice: info.price,
              status: buyOrder.status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED',
              lastTradePrice: info.price,
              lastTradeQuantity: info.filledQuantity
            }
          });
        }

        // Satıcının bildirimini hazırla
        if (initialSellQuantity > quantity) {
          const sellOrder = await Order.findOne({ 
            where: { userId, marketId, type: 'SELL', status: ['OPEN', 'FILLED'] }, 
            order: [['createdAt', 'DESC']],
            transaction: t 
          });
          
          if (sellOrder) {
            wsNotifications.push({
              type: 'order_filled',
              userId: userId,
              data: {
                orderId: sellOrder.id,
                marketId,
                marketTitle: market.title,
                orderType: 'SELL',
                outcome,
                originalQuantity: initialSellQuantity,
                filledQuantity: initialSellQuantity - quantity,
                remainingQuantity: quantity,
                price,
                avgFillPrice: price,
                status: quantity === 0 ? 'FILLED' : 'PARTIALLY_FILLED',
                lastTradePrice: price,
                lastTradeQuantity: initialSellQuantity - quantity
              }
            });
          }
        }
      }

      // BUY emri için satıcı bildirimlerini hazırla
      if (type === 'BUY' && filledOrders && filledOrders.size > 0) {
        for (const [orderId, info] of filledOrders.entries()) {
          const sellOrder = await Order.findByPk(orderId, { transaction: t });
          wsNotifications.push({
            type: 'order_filled',
            userId: info.userId,
            data: {
              orderId: orderId,
              marketId,
              marketTitle: market.title,
              orderType: 'SELL',
              outcome,
              originalQuantity: info.originalQuantity,
              filledQuantity: info.filledQuantity,
              remainingQuantity: sellOrder.quantity,
              price: info.price,
              avgFillPrice: info.price,
              status: sellOrder.status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED',
              lastTradePrice: info.price,
              lastTradeQuantity: info.filledQuantity
            }
          });
        }

        // Alıcının bildirimini hazırla
        if (newBuyOrder && initialQuantity > quantity) {
          wsNotifications.push({
            type: 'order_filled',
            userId: userId,
            data: {
              orderId: newBuyOrder.id,
              marketId,
              marketTitle: market.title,
              orderType: 'BUY',
              outcome,
              originalQuantity: initialQuantity,
              filledQuantity: initialQuantity - quantity,
              remainingQuantity: quantity,
              price,
              avgFillPrice: actualSpent > 0 ? (actualSpent / (initialQuantity - quantity)) : price,
              status: quantity === 0 ? 'FILLED' : 'PARTIALLY_FILLED',
              lastTradePrice: price,
              lastTradeQuantity: initialQuantity - quantity
            }
          });
        }
      }

      await t.commit();

      // 🆕 Transaction commit edildikten SONRA WebSocket bildirimlerini gönder
      for (const notification of wsNotifications) {
        try {
          if (notification.type === 'order_filled') {
            await websocketServer.publishOrderFilled(notification.userId, notification.data);
          }
        } catch (error) {
          console.error('Order filled WebSocket bildirimi hatası:', error.message);
        }
      }

      try {
        await this.publishOrderBookUpdate(marketId);
      } catch (error) {
        console.error('WebSocket bildirim hatası:', error.message);
      }

      // Response mesajları
      let resultMessage;
      if (quantity === 0) {
        resultMessage = "Emir tamamen eşleşti ve tamamlandı.";
      } else if (quantity < initialQuantity) {
        resultMessage = "Emriniz kısmen eşleşti, kalanı deftere yazıldı.";
      } else {
        resultMessage = "Eşleşme bulunamadı, emriniz deftere yazıldı.";
      }

      return { 
        message: resultMessage,
        order: type === 'BUY' ? newBuyOrder : null
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async cancelOrder(orderId, userId) {
    const t = await sequelize.transaction();

    try {
      const order = await Order.findByPk(orderId, { transaction: t });

      if (!order) throw ApiError.notFound('Emir bulunamadı.');
      if (order.userId !== userId) throw ApiError.forbidden('Bu emri iptal etme yetkiniz yok.');
      if (order.status !== 'OPEN') throw ApiError.badRequest('Sadece açık emirler iptal edilebilir.');

      const market = await Market.findByPk(order.marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');

      // Redis'ten sil
      const outcomeString = order.outcome ? 'yes' : 'no';
      const orderType = order.type === 'BUY' ? 'bids' : 'asks';
      const redisKey = `market:${order.marketId}:${outcomeString}:${orderType}`;

      const allOrders = await redisClient.zRangeWithScores(redisKey, 0, -1);
      for (const redisOrder of allOrders) {
        if (redisOrder.value.startsWith(`${orderId}:`)) {
          await redisClient.zRem(redisKey, redisOrder.value);
          break;
        }
      }

      // Para/hisse iadesi
      let refundAmount = 0;
      let refundType = '';
      
      if (order.type === 'BUY') {
        const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
        refundType = 'balance';
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction: t });

        await Transaction.create({
          userId,
          marketId: order.marketId,
          type: 'refund',
          amount: refundAmount,
          description: `BUY emri iptal: ${order.quantity} x ${order.price} = ${refundAmount} TL iade`
        }, { transaction: t });
      }

      if (order.type === 'SELL') {
        refundType = 'shares';
        let share = await Share.findOne({
          where: { userId, marketId: order.marketId, outcome: order.outcome },
          transaction: t
        });

        if (!share) {
          share = await Share.create({
            userId, 
            marketId: order.marketId, 
            outcome: order.outcome, 
            quantity: order.quantity
          }, { transaction: t });
          
          console.log(`📈 Yeni hisse kaydı oluşturuldu: ${order.quantity} adet`);
        } else {
          share.quantity = parseInt(share.quantity) + parseInt(order.quantity);
          await share.save({ transaction: t });
          
          console.log(`📈 Hisse iadesi: ${share.quantity - order.quantity} + ${order.quantity} = ${share.quantity}`);
        }

        await Transaction.create({
          userId,
          marketId: order.marketId,
          type: 'refund',
          amount: 0,
          description: `SELL emri iptal: ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} hisse iade`
        }, { transaction: t });
      }

      order.status = 'CANCELLED';
      await order.save({ transaction: t });

      // WebSocket bildirimi için gerekli verileri transaction içinde topla
      const cancelNotificationData = {
        orderId: order.id,
        marketId: order.marketId,
        marketTitle: market.title,
        orderType: order.type,
        outcome: order.outcome,
        quantity: order.quantity,
        price: order.price,
        reason: 'user_cancelled',
        refundAmount: refundAmount,
        refundType: refundType
      };

      await t.commit();

      // 🆕 Transaction commit edildikten SONRA WebSocket bildirimlerini gönder
      try {
        await websocketServer.publishOrderCancelled(userId, cancelNotificationData);
      } catch (error) {
        console.error('Order cancelled WebSocket bildirimi hatası:', error.message);
      }

      try {
        await this.publishOrderBookUpdate(order.marketId);
      } catch (error) {
        console.error('WebSocket bildirim hatası:', error.message);
      }

      return { message: 'Emir başarıyla iptal edildi.', cancelledOrder: order };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async publishOrderBookUpdate(marketId) {
    const orderBook = await marketService.getOrderBook(marketId);
    await websocketServer.publishOrderBookUpdate(marketId, orderBook);
    console.log(`📡 Order book güncellendi: ${marketId}`);
  }

  async getUserOrders(userId, filters = {}) {
    const where = { userId };
    if (filters.status) where.status = filters.status;
    if (filters.marketId) where.marketId = filters.marketId;
    if (filters.type) where.type = filters.type;

    const orders = await Order.findAll({
      where,
      include: [{ model: Market, attributes: ['id', 'title', 'status'] }],
      order: [['createdAt', 'DESC']]
    });

    return orders;
  }
}

module.exports = new OrderService();