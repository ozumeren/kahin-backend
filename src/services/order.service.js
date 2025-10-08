// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, Share, sequelize } = db;
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');

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
}

module.exports = new OrderService();