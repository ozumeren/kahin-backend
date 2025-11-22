// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, Transaction, Trade, sequelize } = db;
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');
const marketService = require('./market.service');
const priceHistoryService = require('./priceHistory.service');

// Order type constants
const ORDER_TYPES = {
  LIMIT: 'LIMIT',
  MARKET: 'MARKET',
  STOP_LOSS: 'STOP_LOSS',
  TAKE_PROFIT: 'TAKE_PROFIT',
  STOP_LIMIT: 'STOP_LIMIT'
};

// Time-in-force constants
const TIME_IN_FORCE = {
  GTC: 'GTC',  // Good-Til-Cancelled
  GTD: 'GTD',  // Good-Til-Date
  IOC: 'IOC',  // Immediate-Or-Cancel
  FOK: 'FOK'   // Fill-Or-Kill
};

const getMarketKeys = (marketId, outcome) => {
  const outcomeString = outcome ? 'yes' : 'no';
  return {
    bids: `market:${marketId}:${outcomeString}:bids`,
    asks: `market:${marketId}:${outcomeString}:asks`,
  };
};

class OrderService {
  async createOrder(orderData) {
    let {
      userId,
      marketId,
      type,
      outcome,
      quantity,
      price,
      // New advanced order fields
      order_type = ORDER_TYPES.LIMIT,
      time_in_force = TIME_IN_FORCE.GTC,
      expires_at = null,
      trigger_price = null
    } = orderData;

    // Route to appropriate handler based on order type
    if (order_type === ORDER_TYPES.MARKET) {
      return this.createMarketOrder({ userId, marketId, type, outcome, quantity, time_in_force });
    }

    if (order_type === ORDER_TYPES.STOP_LOSS || order_type === ORDER_TYPES.TAKE_PROFIT || order_type === ORDER_TYPES.STOP_LIMIT) {
      return this.createConditionalOrder({ userId, marketId, type, outcome, quantity, price, order_type, trigger_price, time_in_force, expires_at });
    }

    // Standard LIMIT order flow continues below
    const initialQuantity = quantity;
    const t = await sequelize.transaction();

    try {
      // ========== PHASE 1: VALIDATIONS ==========
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Pazar işlem için açık değil.');

      // ✅ YENİ: Kapanış tarihi kontrolü (real-time)
      const now = new Date();
      if (market.closing_date && new Date(market.closing_date) <= now) {
        throw ApiError.badRequest('Pazar kapanış saati geçmiş, yeni emir kabul edilmiyor.');
      }

      // Validate time_in_force for GTD orders
      if (time_in_force === TIME_IN_FORCE.GTD && !expires_at) {
        throw ApiError.badRequest('GTD emirleri için expires_at zorunludur.');
      }
      if (expires_at && new Date(expires_at) <= now) {
        throw ApiError.badRequest('Geçersiz son kullanma tarihi.');
      }

      // ✅ Fiyat validasyonu (0.01 - 0.99 aralığı)
      if (price < 0.01 || price > 0.99) {
        throw ApiError.badRequest('Fiyat 0.01 TL ile 0.99 TL arasında olmalıdır.');
      }
      
      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);
      
      // ✅ Eşleşen emirleri takip etmek için (tüm tipler için tanımla)
      const filledOrders = new Map(); // SELL emirleri için (BUY ile eşleşenler)
      const filledBuyOrders = new Map(); // BUY emirleri için (SELL ile eşleşenler)
      
      // ✅ YENİ: Eğer BUY emri varsa, önce order oluştur
      let newBuyOrder = null;
      let newSellOrder = null;
      
      // ✅ Initial quantity tracking (WebSocket notifications için)
      let initialQuantity = quantity;
      let initialSellQuantity = quantity;
      
      // ✅ Actual spent tracking (BUY emirleri için)
      let actualSpent = 0;

      // 💰 Bakiye güncellemelerini transaction sonrasında göndermek için
      const balanceUpdates = [];
      
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
          status: 'OPEN',
          order_type: order_type || 'LIMIT',
          time_in_force: time_in_force || 'GTC',
          expires_at: expires_at || null,
          filled_quantity: 0
        }, { transaction: t });

        // Eşleşme kontrolü
        const matchingSellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);

        for (const sellOrderData of matchingSellOrders) {
          if (quantity === 0) break;
          const sellPrice = sellOrderData.score;
          const parts = sellOrderData.value.split(':');
          const sellerOrderId = parts[0];
          const sellerOrderQuantity = parseInt(parts[1]);
          const sellerUserId = parts[2]; // userId varsa al

          // ✅ Self-trading önleme kontrolü
          if (sellerUserId && sellerUserId === userId) {
            console.log(`⚠️ Self-trading engellendi: Kullanıcı ${userId} kendi emriyle eşleşemez`);
            continue; // Aynı kullanıcının emrini atla
          }

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

            // 💰 Satıcının bakiye güncellemesini kaydet (transaction sonrası gönderilecek)
            balanceUpdates.push({ userId: seller.id, balance: seller.balance });

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
                originalQuantity: sellerOrderQuantity,
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
                value: `${sellerOrderId}:${remainingSellerQty}:${sellerUserId || ''}` 
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
          
          // Redis'e ekle (userId ile birlikte)
          console.log(`📊 Redis'e BUY emri ekleniyor: ${bidsKey} -> ${newBuyOrder.id}:${quantity}:${userId} @ ${price}`);
          await redisClient.zAdd(bidsKey, { 
            score: price, 
            value: `${newBuyOrder.id}:${quantity}:${userId}` 
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

        // 💰 BUY emri veren kullanıcının final bakiyesini kaydet
        const finalBuyer = await User.findByPk(userId, { transaction: t });
        balanceUpdates.push({ userId: finalBuyer.id, balance: finalBuyer.balance });

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
          status: 'OPEN',
          order_type: order_type || 'LIMIT',
          time_in_force: time_in_force || 'GTC',
          expires_at: expires_at || null,
          filled_quantity: 0
        }, { transaction: t });

        await Transaction.create({
          userId,
          marketId,
          type: 'bet',
          amount: 0,
          description: `${quantity} adet ${outcome ? 'YES' : 'NO'} hissesi SELL emrine kilitlendi (fiyat: ${price})`
        }, { transaction: t });
        
        // initialSellQuantity üstte tanımlandı, tekrar tanımlamaya gerek yok
        
        // Eşleşme kontrolü
        const matchingBuyOrders = await redisClient.zRangeWithScores(bidsKey, 0, -1, { REV: true });

        for (const buyOrderData of matchingBuyOrders) {
          if (quantity === 0) break;
          const buyPrice = buyOrderData.score;
          const parts = buyOrderData.value.split(':');
          const buyerOrderId = parts[0];
          const buyerOrderQuantity = parseInt(parts[1]);
          const buyerUserId = parts[2]; // userId varsa al

          // ✅ Self-trading önleme kontrolü
          if (buyerUserId && buyerUserId === userId) {
            console.log(`⚠️ Self-trading engellendi: Kullanıcı ${userId} kendi emriyle eşleşemez`);
            continue; // Aynı kullanıcının emrini atla
          }

          if (buyPrice >= price) {
            const tradeQuantity = Math.min(quantity, buyerOrderQuantity);
            const tradeTotal = tradeQuantity * buyPrice;

            // Satıcıya para ver
            seller.balance = parseFloat(seller.balance) + tradeTotal;
            await seller.save({ transaction: t });

            // 💰 Satıcının bakiye güncellemesini kaydet (transaction sonrası gönderilecek)
            balanceUpdates.push({ userId: seller.id, balance: seller.balance });

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
                originalQuantity: buyerOrderQuantity,
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

              // 💰 Alıcının bakiye güncellemesini kaydet (transaction sonrası gönderilecek)
              balanceUpdates.push({ userId: buyer.id, balance: buyer.balance });
            }

            // Redis güncelle
            quantity -= tradeQuantity;
            const remainingBuyerQty = buyerOrderQuantity - tradeQuantity;
            await redisClient.zRem(bidsKey, buyOrderData.value);
            
            if (remainingBuyerQty > 0) {
              await redisClient.zAdd(bidsKey, { 
                score: buyPrice, 
                value: `${buyerOrderId}:${remainingBuyerQty}:${buyerUserId || ''}` 
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
          
          // Redis'e ekle (userId ile birlikte)
          console.log(`📊 Redis'e SELL emri ekleniyor: ${asksKey} -> ${newSellOrder.id}:${quantity}:${userId} @ ${price}`);
          await redisClient.zAdd(asksKey, { 
            score: price, 
            value: `${newSellOrder.id}:${quantity}:${userId}` 
          });
        }
        
        console.log(`✅ SELL eşleşmesi tamamlandı - Eşleşen: ${initialSellQuantity - quantity}, Kalan: ${quantity}`);

        // 💰 SELL emri veren kullanıcının final bakiyesini kaydet
        const finalSeller = await User.findByPk(userId, { transaction: t });
        balanceUpdates.push({ userId: finalSeller.id, balance: finalSeller.balance });
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

      // 💰 Bakiye güncellemelerini gönder (tekrar eden userId'leri temizle)
      const uniqueBalanceUpdates = new Map();
      balanceUpdates.forEach(update => {
        uniqueBalanceUpdates.set(update.userId, update.balance);
      });

      for (const [userId, balance] of uniqueBalanceUpdates.entries()) {
        try {
          console.log(`💰 Order Service - Bakiye güncellemesi gönderiliyor: userId=${userId} (type: ${typeof userId}), balance=${balance}`);
          await websocketServer.publishBalanceUpdate(userId, balance);
        } catch (error) {
          console.error('Balance update WebSocket bildirimi hatası:', error.message);
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
      let updatedUser = null;
      
      if (order.type === 'BUY') {
        const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
        refundType = 'balance';
        user.balance = parseFloat(user.balance) + refundAmount;
        await user.save({ transaction: t });
        updatedUser = user;

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

      // 💰 Bakiye güncellemesini bildir (BUY emri iptal edildiyse)
      if (updatedUser) {
        try {
          await websocketServer.publishBalanceUpdate(userId, updatedUser.balance);
        } catch (error) {
          console.error('Balance update WebSocket bildirimi hatası:', error.message);
        }
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

  async getOrderById(orderId, userId) {
    const order = await Order.findOne({
      where: { id: orderId, userId },
      include: [
        {
          model: Market,
          attributes: ['id', 'title', 'status', 'closing_date', 'market_type']
        },
        {
          model: Trade,
          as: 'buyTrades',
          attributes: ['id', 'quantity', 'price', 'total', 'createdAt'],
          required: false
        }
      ]
    });

    if (!order) {
      throw ApiError.notFound('Emir bulunamadı.');
    }

    // Hesapla: kaç adet dolduruldu
    const trades = order.buyTrades || [];
    const filledQuantity = trades.reduce((sum, trade) => sum + trade.quantity, 0);

    return {
      ...order.toJSON(),
      filled_quantity: filledQuantity,
      remaining_quantity: order.quantity - filledQuantity
    };
  }

  async amendOrder(orderId, userId, updates) {
    const { price, quantity } = updates;

    // Validasyon
    if (!price && !quantity) {
      throw ApiError.badRequest('Fiyat veya miktar güncellenmeli.');
    }

    const t = await sequelize.transaction();

    try {
      // Emri bul
      const order = await Order.findOne({
        where: { id: orderId, userId, status: 'OPEN' },
        transaction: t
      });

      if (!order) {
        throw ApiError.notFound('Emir bulunamadı veya güncellenebilir durumda değil.');
      }

      const market = await Market.findByPk(order.marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');

      // Redis'ten kaldır
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

      const oldPrice = parseFloat(order.price);
      const oldQuantity = order.quantity;

      // Fiyat güncelleme
      if (price !== undefined) {
        if (price < 0.01 || price > 0.99) {
          throw ApiError.badRequest('Fiyat 0.01 TL ile 0.99 TL arasında olmalıdır.');
        }
        order.price = price;
      }

      // Miktar güncelleme
      if (quantity !== undefined) {
        if (quantity < 1) {
          throw ApiError.badRequest('Miktar en az 1 olmalıdır.');
        }

        const quantityDiff = quantity - oldQuantity;
        const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });

        if (order.type === 'BUY') {
          // BUY emri: bakiye kontrolü
          if (quantityDiff > 0) {
            const additionalCost = quantityDiff * parseFloat(order.price);
            if (parseFloat(user.balance) < additionalCost) {
              throw ApiError.badRequest('Yetersiz bakiye.');
            }
            user.balance = parseFloat(user.balance) - additionalCost;
          } else if (quantityDiff < 0) {
            const refund = Math.abs(quantityDiff) * parseFloat(order.price);
            user.balance = parseFloat(user.balance) + refund;
          }
        } else if (order.type === 'SELL') {
          // SELL emri: hisse kontrolü
          const share = await Share.findOne({
            where: { userId, marketId: order.marketId, outcome: order.outcome },
            transaction: t
          });

          if (!share) {
            throw ApiError.badRequest('Yeterli hisse bulunamadı.');
          }

          if (quantityDiff > 0) {
            if (share.quantity < quantityDiff) {
              throw ApiError.badRequest('Yetersiz hisse.');
            }
            share.quantity -= quantityDiff;
          } else if (quantityDiff < 0) {
            share.quantity += Math.abs(quantityDiff);
          }

          await share.save({ transaction: t });
        }

        await user.save({ transaction: t });
        order.quantity = quantity;
      }

      await order.save({ transaction: t });

      // Redis'e geri ekle
      const newPrice = parseFloat(order.price);
      const newQuantity = order.quantity;
      await redisClient.zAdd(redisKey, {
        score: newPrice,
        value: `${orderId}:${newQuantity}:${userId}`
      });

      // Order book güncelleme bildirimi
      try {
        await websocketServer.publishOrderBookUpdate(order.marketId);
      } catch (error) {
        console.error('WebSocket order book update hatası:', error.message);
      }

      await t.commit();

      return {
        id: order.id,
        marketId: order.marketId,
        type: order.type,
        outcome: order.outcome,
        quantity: order.quantity,
        price: order.price,
        status: order.status,
        updated_at: new Date()
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async createBatchOrders(userId, orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      throw ApiError.badRequest('En az bir emir belirtilmelidir.');
    }

    if (orders.length > 15) {
      throw ApiError.badRequest('Bir seferde en fazla 15 emir oluşturulabilir.');
    }

    const results = {
      success: [],
      failed: []
    };

    for (const orderData of orders) {
      try {
        const newOrder = await this.createOrder({
          ...orderData,
          userId
        });

        results.success.push({
          orderId: newOrder.order.id,
          marketId: orderData.marketId,
          status: 'OPEN'
        });
      } catch (error) {
        results.failed.push({
          marketId: orderData.marketId,
          type: orderData.type,
          error: error.message,
          code: error.statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
        });
      }
    }

    return results;
  }

  async cancelBatchOrders(userId, orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw ApiError.badRequest('En az bir emir ID\'si belirtilmelidir.');
    }

    if (orderIds.length > 50) {
      throw ApiError.badRequest('Bir seferde en fazla 50 emir iptal edilebilir.');
    }

    const results = {
      cancelled: [],
      failed: []
    };

    for (const orderId of orderIds) {
      try {
        await this.cancelOrder(orderId, userId);
        results.cancelled.push(orderId);
      } catch (error) {
        results.failed.push({
          order_id: orderId,
          error: error.message
        });
      }
    }

    return results;
  }

  // ========== MARKET ORDERS ==========
  /**
   * Create a market order - executes immediately at best available price
   * Market orders take liquidity from the order book
   */
  async createMarketOrder(orderData) {
    const { userId, marketId, type, outcome, quantity, time_in_force = 'IOC' } = orderData;
    const t = await sequelize.transaction();

    try {
      // Validations
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Pazar işlem için açık değil.');

      const now = new Date();
      if (market.closing_date && new Date(market.closing_date) <= now) {
        throw ApiError.badRequest('Pazar kapanış saati geçmiş.');
      }

      const { bids: bidsKey, asks: asksKey } = getMarketKeys(marketId, outcome);
      let remainingQuantity = quantity;
      let totalSpent = 0;
      let totalFilled = 0;
      const trades = [];
      const balanceUpdates = [];

      if (type === 'BUY') {
        const buyer = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });

        // Get all available sell orders sorted by price (lowest first)
        const sellOrders = await redisClient.zRangeWithScores(asksKey, 0, -1);

        if (sellOrders.length === 0) {
          throw ApiError.badRequest('Eşleşecek satış emri yok.');
        }

        // Calculate maximum possible cost for FOK validation
        if (time_in_force === 'FOK') {
          let availableQuantity = 0;
          for (const order of sellOrders) {
            const parts = order.value.split(':');
            availableQuantity += parseInt(parts[1]);
            if (availableQuantity >= quantity) break;
          }
          if (availableQuantity < quantity) {
            throw ApiError.badRequest('FOK: Yeterli likidite yok, emir iptal edildi.');
          }
        }

        // Create market order record
        const marketOrder = await Order.create({
          userId,
          marketId,
          type: 'BUY',
          outcome,
          quantity,
          price: null, // Market orders have no set price
          status: 'OPEN',
          order_type: 'MARKET',
          time_in_force,
          filled_quantity: 0
        }, { transaction: t });

        // Match against sell orders
        for (const sellOrderData of sellOrders) {
          if (remainingQuantity === 0) break;

          const sellPrice = sellOrderData.score;
          const parts = sellOrderData.value.split(':');
          const sellerOrderId = parts[0];
          const sellerOrderQuantity = parseInt(parts[1]);
          const sellerUserId = parts[2];

          // Skip self-trading
          if (sellerUserId === userId) continue;

          const tradeQuantity = Math.min(remainingQuantity, sellerOrderQuantity);
          const tradeTotal = tradeQuantity * sellPrice;

          // Check buyer has enough balance
          if (buyer.balance < totalSpent + tradeTotal) {
            if (time_in_force === 'FOK') {
              throw ApiError.badRequest('FOK: Yetersiz bakiye, emir iptal edildi.');
            }
            break; // IOC: fill what we can
          }

          totalSpent += tradeTotal;
          totalFilled += tradeQuantity;

          // Update seller
          const sellOrder = await Order.findByPk(sellerOrderId, { transaction: t });
          const seller = await User.findByPk(sellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });
          seller.balance = parseFloat(seller.balance) + tradeTotal;
          await seller.save({ transaction: t });
          balanceUpdates.push({ userId: seller.id, balance: seller.balance });

          // Create trade record
          const trade = await Trade.create({
            buyerId: buyer.id,
            buyOrderId: marketOrder.id,
            sellerId: seller.id,
            sellOrderId: sellerOrderId,
            marketId,
            outcome,
            quantity: tradeQuantity,
            price: sellPrice,
            total: tradeTotal,
            tradeType: 'MARKET'
          }, { transaction: t });
          trades.push(trade);

          // Record price history
          await priceHistoryService.recordTrade(marketId, outcome, sellPrice, tradeQuantity);

          // Transfer shares to buyer
          let buyerShare = await Share.findOne({
            where: { userId: buyer.id, marketId, outcome },
            transaction: t
          });
          if (!buyerShare) {
            buyerShare = await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          }
          buyerShare.quantity += tradeQuantity;
          await buyerShare.save({ transaction: t });

          // Update Redis and sell order
          remainingQuantity -= tradeQuantity;
          const remainingSellerQty = sellerOrderQuantity - tradeQuantity;
          await redisClient.zRem(asksKey, sellOrderData.value);

          if (remainingSellerQty > 0) {
            await redisClient.zAdd(asksKey, {
              score: sellPrice,
              value: `${sellerOrderId}:${remainingSellerQty}:${sellerUserId || ''}`
            });
            await Order.update(
              { quantity: remainingSellerQty, filled_quantity: sequelize.literal(`filled_quantity + ${tradeQuantity}`) },
              { where: { id: sellerOrderId }, transaction: t }
            );
          } else {
            await Order.update(
              { status: 'FILLED', filled_quantity: sequelize.literal(`filled_quantity + ${tradeQuantity}`) },
              { where: { id: sellerOrderId }, transaction: t }
            );
          }
        }

        // Deduct from buyer
        buyer.balance -= totalSpent;
        await buyer.save({ transaction: t });
        balanceUpdates.push({ userId: buyer.id, balance: buyer.balance });

        // Update market order
        const avgPrice = totalFilled > 0 ? totalSpent / totalFilled : 0;
        marketOrder.filled_quantity = totalFilled;
        marketOrder.average_fill_price = avgPrice;
        marketOrder.quantity = quantity - totalFilled;
        marketOrder.status = totalFilled === quantity ? 'FILLED' : (totalFilled > 0 ? 'FILLED' : 'CANCELLED');
        await marketOrder.save({ transaction: t });

        // Create transaction record
        if (totalSpent > 0) {
          await Transaction.create({
            userId,
            marketId,
            type: 'bet',
            amount: -totalSpent,
            description: `Market BUY: ${totalFilled} adet ${outcome ? 'YES' : 'NO'} @ ortalama ${avgPrice.toFixed(4)}`
          }, { transaction: t });
        }

      } else if (type === 'SELL') {
        // SELL market order logic
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({
          where: { userId, marketId, outcome },
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw ApiError.badRequest('Satmak için yeterli hisseniz yok.');
        }

        // Get all buy orders sorted by price (highest first)
        const buyOrders = await redisClient.zRangeWithScores(bidsKey, 0, -1, { REV: true });

        if (buyOrders.length === 0) {
          throw ApiError.badRequest('Eşleşecek alış emri yok.');
        }

        // FOK validation
        if (time_in_force === 'FOK') {
          let availableQuantity = 0;
          for (const order of buyOrders) {
            const parts = order.value.split(':');
            availableQuantity += parseInt(parts[1]);
            if (availableQuantity >= quantity) break;
          }
          if (availableQuantity < quantity) {
            throw ApiError.badRequest('FOK: Yeterli likidite yok, emir iptal edildi.');
          }
        }

        // Create market order record
        const marketOrder = await Order.create({
          userId,
          marketId,
          type: 'SELL',
          outcome,
          quantity,
          price: null,
          status: 'OPEN',
          order_type: 'MARKET',
          time_in_force,
          filled_quantity: 0
        }, { transaction: t });

        // Lock shares
        sellerShare.quantity -= quantity;

        // Match against buy orders
        for (const buyOrderData of buyOrders) {
          if (remainingQuantity === 0) break;

          const buyPrice = buyOrderData.score;
          const parts = buyOrderData.value.split(':');
          const buyerOrderId = parts[0];
          const buyerOrderQuantity = parseInt(parts[1]);
          const buyerUserId = parts[2];

          // Skip self-trading
          if (buyerUserId === userId) continue;

          const tradeQuantity = Math.min(remainingQuantity, buyerOrderQuantity);
          const tradeTotal = tradeQuantity * buyPrice;

          totalSpent += tradeTotal;
          totalFilled += tradeQuantity;

          // Update buyer - give shares
          const buyOrder = await Order.findByPk(buyerOrderId, { transaction: t });
          const buyer = await User.findByPk(buyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

          let buyerShare = await Share.findOne({
            where: { userId: buyer.id, marketId, outcome },
            transaction: t
          });
          if (!buyerShare) {
            buyerShare = await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          }
          buyerShare.quantity += tradeQuantity;
          await buyerShare.save({ transaction: t });

          // Create trade record
          const trade = await Trade.create({
            buyerId: buyer.id,
            buyOrderId: buyerOrderId,
            sellerId: seller.id,
            sellOrderId: marketOrder.id,
            marketId,
            outcome,
            quantity: tradeQuantity,
            price: buyPrice,
            total: tradeTotal,
            tradeType: 'MARKET'
          }, { transaction: t });
          trades.push(trade);

          // Record price history
          await priceHistoryService.recordTrade(marketId, outcome, buyPrice, tradeQuantity);

          // Update Redis and buy order
          remainingQuantity -= tradeQuantity;
          const remainingBuyerQty = buyerOrderQuantity - tradeQuantity;
          await redisClient.zRem(bidsKey, buyOrderData.value);

          if (remainingBuyerQty > 0) {
            await redisClient.zAdd(bidsKey, {
              score: buyPrice,
              value: `${buyerOrderId}:${remainingBuyerQty}:${buyerUserId || ''}`
            });
            await Order.update(
              { quantity: remainingBuyerQty, filled_quantity: sequelize.literal(`filled_quantity + ${tradeQuantity}`) },
              { where: { id: buyerOrderId }, transaction: t }
            );
          } else {
            await Order.update(
              { status: 'FILLED', filled_quantity: sequelize.literal(`filled_quantity + ${tradeQuantity}`) },
              { where: { id: buyerOrderId }, transaction: t }
            );
          }
        }

        // Give money to seller
        seller.balance = parseFloat(seller.balance) + totalSpent;
        await seller.save({ transaction: t });
        balanceUpdates.push({ userId: seller.id, balance: seller.balance });

        // Return unfilled shares
        if (remainingQuantity > 0) {
          sellerShare.quantity += remainingQuantity;
        }
        await sellerShare.save({ transaction: t });
        if (sellerShare.quantity === 0) {
          await sellerShare.destroy({ transaction: t });
        }

        // Update market order
        const avgPrice = totalFilled > 0 ? totalSpent / totalFilled : 0;
        marketOrder.filled_quantity = totalFilled;
        marketOrder.average_fill_price = avgPrice;
        marketOrder.quantity = quantity - totalFilled;
        marketOrder.status = totalFilled === quantity ? 'FILLED' : (totalFilled > 0 ? 'FILLED' : 'CANCELLED');
        await marketOrder.save({ transaction: t });

        // Create transaction record
        if (totalSpent > 0) {
          await Transaction.create({
            userId,
            marketId,
            type: 'payout',
            amount: totalSpent,
            description: `Market SELL: ${totalFilled} adet ${outcome ? 'YES' : 'NO'} @ ortalama ${avgPrice.toFixed(4)}`
          }, { transaction: t });
        }
      }

      await t.commit();

      // Send WebSocket notifications
      for (const { userId, balance } of balanceUpdates) {
        try {
          await websocketServer.publishBalanceUpdate(userId, balance);
        } catch (error) {
          console.error('Balance update WebSocket error:', error.message);
        }
      }

      try {
        await this.publishOrderBookUpdate(marketId);
      } catch (error) {
        console.error('Order book update error:', error.message);
      }

      const avgPrice = totalFilled > 0 ? totalSpent / totalFilled : 0;
      return {
        message: totalFilled === quantity
          ? 'Market emri tamamen doldu.'
          : (totalFilled > 0 ? `Market emri kısmen doldu: ${totalFilled}/${quantity}` : 'Market emri doldurulamadı.'),
        order: {
          filled_quantity: totalFilled,
          average_fill_price: avgPrice,
          total_spent: totalSpent,
          trades_count: trades.length
        }
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // ========== CONDITIONAL ORDERS (STOP-LOSS, TAKE-PROFIT) ==========
  /**
   * Create a conditional order that triggers when price reaches trigger_price
   */
  async createConditionalOrder(orderData) {
    const {
      userId,
      marketId,
      type,
      outcome,
      quantity,
      price,
      order_type,
      trigger_price,
      time_in_force = 'GTC',
      expires_at = null
    } = orderData;

    // Validations
    if (!trigger_price) {
      throw ApiError.badRequest('Koşullu emirler için trigger_price zorunludur.');
    }
    if (trigger_price < 0.01 || trigger_price > 0.99) {
      throw ApiError.badRequest('Trigger fiyatı 0.01 ile 0.99 arasında olmalıdır.');
    }

    // For STOP_LIMIT orders, price is required
    if (order_type === ORDER_TYPES.STOP_LIMIT && (!price || price < 0.01 || price > 0.99)) {
      throw ApiError.badRequest('STOP_LIMIT emirleri için geçerli bir limit fiyatı gereklidir.');
    }

    const t = await sequelize.transaction();

    try {
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Pazar işlem için açık değil.');

      const now = new Date();
      if (time_in_force === 'GTD' && !expires_at) {
        throw ApiError.badRequest('GTD emirleri için expires_at zorunludur.');
      }
      if (expires_at && new Date(expires_at) <= now) {
        throw ApiError.badRequest('Geçersiz son kullanma tarihi.');
      }

      // For BUY orders, reserve the funds
      if (type === 'BUY') {
        const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const reservePrice = price || trigger_price; // Use limit price or trigger price
        const totalCost = quantity * reservePrice;

        if (user.balance < totalCost) {
          throw ApiError.badRequest('Yetersiz bakiye.');
        }

        user.balance -= totalCost;
        await user.save({ transaction: t });

        await Transaction.create({
          userId,
          marketId,
          type: 'bet',
          amount: -totalCost,
          description: `${order_type} emri için bakiye ayrıldı: ${quantity} x ${reservePrice}`
        }, { transaction: t });
      }

      // For SELL orders, lock the shares
      if (type === 'SELL') {
        const share = await Share.findOne({
          where: { userId, marketId, outcome },
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (!share || share.quantity < quantity) {
          throw ApiError.badRequest('Satmak için yeterli hisseniz yok.');
        }

        share.quantity -= quantity;
        await share.save({ transaction: t });

        if (share.quantity === 0) {
          await share.destroy({ transaction: t });
        }
      }

      // Create the conditional order
      const conditionalOrder = await Order.create({
        userId,
        marketId,
        type,
        outcome,
        quantity,
        price: order_type === ORDER_TYPES.STOP_LIMIT ? price : null,
        status: 'OPEN',
        order_type,
        time_in_force,
        expires_at,
        trigger_price,
        filled_quantity: 0
      }, { transaction: t });

      // Store in Redis for quick trigger checking
      const triggerKey = `triggers:${marketId}:${outcome}`;
      await redisClient.zAdd(triggerKey, {
        score: parseFloat(trigger_price),
        value: `${conditionalOrder.id}:${order_type}:${type}`
      });

      await t.commit();

      return {
        message: `${order_type} emri oluşturuldu. Fiyat ${trigger_price}'a ulaştığında tetiklenecek.`,
        order: conditionalOrder
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Check and trigger conditional orders when price changes
   * Should be called after each trade
   */
  async checkAndTriggerConditionalOrders(marketId, outcome, currentPrice) {
    const triggerKey = `triggers:${marketId}:${outcome}`;

    // Get all potential triggers
    const triggers = await redisClient.zRangeWithScores(triggerKey, 0, -1);

    for (const trigger of triggers) {
      const [orderId, orderType, tradeType] = trigger.value.split(':');
      const triggerPrice = trigger.score;

      let shouldTrigger = false;

      // STOP_LOSS: triggers when price falls below trigger_price (for long) or rises above (for short)
      // TAKE_PROFIT: triggers when price rises above trigger_price (for long) or falls below (for short)
      if (orderType === 'STOP_LOSS') {
        if (tradeType === 'SELL') {
          // Long position stop-loss: trigger when price drops
          shouldTrigger = currentPrice <= triggerPrice;
        } else {
          // Short position stop-loss: trigger when price rises
          shouldTrigger = currentPrice >= triggerPrice;
        }
      } else if (orderType === 'TAKE_PROFIT') {
        if (tradeType === 'SELL') {
          // Long position take-profit: trigger when price rises
          shouldTrigger = currentPrice >= triggerPrice;
        } else {
          // Short position take-profit: trigger when price drops
          shouldTrigger = currentPrice <= triggerPrice;
        }
      } else if (orderType === 'STOP_LIMIT') {
        // Same as STOP_LOSS but creates a limit order instead of market order
        if (tradeType === 'SELL') {
          shouldTrigger = currentPrice <= triggerPrice;
        } else {
          shouldTrigger = currentPrice >= triggerPrice;
        }
      }

      if (shouldTrigger) {
        await this.executeTriggeredOrder(orderId, orderType);
        await redisClient.zRem(triggerKey, trigger.value);
      }
    }
  }

  /**
   * Execute a triggered conditional order
   */
  async executeTriggeredOrder(orderId, orderType) {
    const t = await sequelize.transaction();

    try {
      const order = await Order.findByPk(orderId, { transaction: t });

      if (!order || order.status !== 'OPEN') {
        await t.rollback();
        return;
      }

      // Mark as triggered
      order.triggered_at = new Date();
      order.status = 'TRIGGERED';
      await order.save({ transaction: t });

      await t.commit();

      // Execute based on order type
      if (orderType === 'STOP_LIMIT') {
        // Create a limit order at the specified price
        await this.createOrder({
          userId: order.userId,
          marketId: order.marketId,
          type: order.type,
          outcome: order.outcome,
          quantity: order.quantity,
          price: order.price,
          order_type: 'LIMIT',
          time_in_force: order.time_in_force,
          expires_at: order.expires_at
        });
      } else {
        // Execute as market order
        await this.createMarketOrder({
          userId: order.userId,
          marketId: order.marketId,
          type: order.type,
          outcome: order.outcome,
          quantity: order.quantity,
          time_in_force: 'IOC'
        });
      }

      console.log(`🎯 Conditional order ${orderId} triggered and executed`);

      // Send WebSocket notification
      try {
        await websocketServer.publishOrderFilled(order.userId, {
          orderId: order.id,
          marketId: order.marketId,
          orderType: orderType,
          status: 'TRIGGERED',
          message: `${orderType} emriniz tetiklendi`
        });
      } catch (error) {
        console.error('Trigger notification error:', error.message);
      }

    } catch (error) {
      await t.rollback();
      console.error(`Error executing triggered order ${orderId}:`, error.message);
    }
  }

  /**
   * Get pending conditional orders for a user
   */
  async getConditionalOrders(userId, marketId = null) {
    const where = {
      userId,
      status: 'OPEN',
      order_type: { [Op.in]: ['STOP_LOSS', 'TAKE_PROFIT', 'STOP_LIMIT'] }
    };

    if (marketId) {
      where.marketId = marketId;
    }

    const orders = await Order.findAll({
      where,
      include: [{ model: Market, attributes: ['id', 'title', 'status'] }],
      order: [['createdAt', 'DESC']]
    });

    return orders;
  }

  /**
   * Cancel expired orders (called by scheduler)
   */
  async cancelExpiredOrders() {
    const now = new Date();

    const expiredOrders = await Order.findAll({
      where: {
        status: 'OPEN',
        time_in_force: 'GTD',
        expires_at: { [Op.lte]: now }
      }
    });

    let cancelledCount = 0;

    for (const order of expiredOrders) {
      try {
        // Remove from Redis
        const { bids: bidsKey, asks: asksKey } = getMarketKeys(order.marketId, order.outcome);
        const redisKey = order.type === 'BUY' ? bidsKey : asksKey;

        const allOrders = await redisClient.zRangeWithScores(redisKey, 0, -1);
        for (const redisOrder of allOrders) {
          if (redisOrder.value.startsWith(`${order.id}:`)) {
            await redisClient.zRem(redisKey, redisOrder.value);
            break;
          }
        }

        // Refund user
        if (order.type === 'BUY') {
          const refundAmount = parseFloat(order.quantity) * parseFloat(order.price);
          await User.increment('balance', { by: refundAmount, where: { id: order.userId } });

          await Transaction.create({
            userId: order.userId,
            marketId: order.marketId,
            type: 'refund',
            amount: refundAmount,
            description: `GTD emir süresi doldu: ${order.quantity} x ${order.price} = ${refundAmount} TL iade`
          });
        } else if (order.type === 'SELL') {
          // Return shares
          let share = await Share.findOne({
            where: { userId: order.userId, marketId: order.marketId, outcome: order.outcome }
          });

          if (!share) {
            share = await Share.create({
              userId: order.userId,
              marketId: order.marketId,
              outcome: order.outcome,
              quantity: order.quantity
            });
          } else {
            share.quantity += parseInt(order.quantity);
            await share.save();
          }

          await Transaction.create({
            userId: order.userId,
            marketId: order.marketId,
            type: 'refund',
            amount: 0,
            description: `GTD emir süresi doldu: ${order.quantity} adet ${order.outcome ? 'YES' : 'NO'} hisse iade`
          });
        }

        // Remove from triggers if conditional
        if (['STOP_LOSS', 'TAKE_PROFIT', 'STOP_LIMIT'].includes(order.order_type)) {
          const triggerKey = `triggers:${order.marketId}:${order.outcome}`;
          const allTriggers = await redisClient.zRangeWithScores(triggerKey, 0, -1);
          for (const trigger of allTriggers) {
            if (trigger.value.startsWith(`${order.id}:`)) {
              await redisClient.zRem(triggerKey, trigger.value);
              break;
            }
          }
        }

        // Update order status
        order.status = 'EXPIRED';
        await order.save();

        cancelledCount++;

        // Notify user
        try {
          await websocketServer.publishOrderCancelled(order.userId, {
            orderId: order.id,
            reason: 'expired',
            message: 'Emir süresi doldu ve iptal edildi.'
          });
        } catch (e) {
          console.error('Expiration notification error:', e.message);
        }

      } catch (error) {
        console.error(`Error cancelling expired order ${order.id}:`, error.message);
      }
    }

    if (cancelledCount > 0) {
      console.log(`⏰ Cancelled ${cancelledCount} expired orders`);
    }

    return cancelledCount;
  }
}

module.exports = new OrderService();