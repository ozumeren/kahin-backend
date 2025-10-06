// src/services/order.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Order, User, Market, sequelize } = db;

class OrderService {
  async createOrder(orderData) {
    const { userId, marketId, type, outcome, quantity, price } = orderData;

    // Bir transaction başlatıyoruz.
    const t = await sequelize.transaction();

    try {
      // --- KONTROLLER ---
      if (!marketId || !type || outcome === null || !quantity || !price) {
        throw new Error('Eksik bilgi: marketId, type, outcome, quantity ve price zorunludur.');
      }
      if (price <= 0 || price >= 1) {
        throw new Error('Fiyat 0 ile 1 arasında olmalıdır.');
      }

      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE });
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      const market = await Market.findByPk(marketId, { lock: t.LOCK.UPDATE });
      if (!market || market.status !== 'open') throw new Error('Pazar bulunamadı veya işlem için açık değil.');

      let newOrder;

      if (type === 'BUY') {
        // --- ALIŞ EMRİ MANTIĞI ---
        const totalCost = quantity * price;
        if (user.balance < totalCost) {
          throw new Error('Yetersiz bakiye.');
        }

        // 1. Kullanıcının bakiyesini düşürerek parayı "kilitle"
        user.balance -= totalCost;
        await user.save({ transaction: t });

        const matchingSellOrder = await Order.findOne({
          where: {
            marketId,
            type: 'SELL',
            outcome,
            status: 'OPEN',
            price: { [Op.lte]: price }, // Satış fiyatı, alış fiyatına eşit veya daha ucuz olmalı
            quantity: quantity, // Şimdilik sadece tam eşleşmeleri arıyoruz
            userId: { [Op.ne]: userId } // Kişi kendi emrini karşılayamaz
          },
          order: [['price', 'ASC']], // En ucuz satıcıyı önce bul
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (matchingSellOrder) {
          // 3. EŞLEŞME BULUNDU! Ticareti gerçekleştir.
          console.log('Eşleşme bulundu!');
          const seller = await User.findByPk(matchingSellOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

          // Satıcının bakiyesini artır
          seller.balance += totalCost;
          await seller.save({ transaction: t });

          // Alıcının hisselerini artır veya oluştur
          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += quantity;
          await buyerShare.save({ transaction: t });

          // Satıcının hisselerini azalt veya oluştur (bu adım satış emri verildiğinde yapılacak)
          
          // Emirlerin durumunu 'FILLED' (tamamlandı) olarak güncelle
          matchingSellOrder.status = 'FILLED';
          await matchingSellOrder.save({ transaction: t });

          // Yeni alış emrini de 'FILLED' olarak oluştur
          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'FILLED' }, { transaction: t });
          
        } else {
          // 4. EŞLEŞME BULUNAMADI. Emri deftere yaz.
          console.log('Eşleşme bulunamadı, emir deftere yazılıyor.');
          newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });
        }

      } else if (type === 'SELL') {
        // --- YENİ SATIŞ EMRİ MANTIĞI ---
        const seller = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        const sellerShare = await Share.findOne({ where: { userId, marketId, outcome }, transaction: t });

        if (!sellerShare || sellerShare.quantity < quantity) {
          throw new Error('Satmak için yeterli hisseniz yok.');
        }

        // 1. Satıcının hisselerini "kilitle"
        sellerShare.quantity -= quantity;
        await sellerShare.save({ transaction: t });

        // 2. Uygun bir alış emri ara
        const matchingBuyOrder = await Order.findOne({
          where: {
            marketId, type: 'BUY', outcome, status: 'OPEN',
            price: { [Op.gte]: price }, // Alış fiyatı, satış fiyatına eşit veya daha yüksek olmalı
            quantity: quantity,
            userId: { [Op.ne]: userId }
          },
          order: [['price', 'DESC']], // En yüksek teklifi veren alıcıyı önce bul
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (matchingBuyOrder) {
          console.log('Satış emri için eşleşme bulundu!');
          const buyer = await User.findByPk(matchingBuyOrder.userId, { lock: t.LOCK.UPDATE, transaction: t });

          // Satıcının bakiyesini artır
          seller.balance += quantity * matchingBuyOrder.price; // Eşleşme, alıcının fiyatından olur
          await seller.save({ transaction: t });

          // Alıcının hisselerini artır
          const buyerShare = await Share.findOne({ where: { userId: buyer.id, marketId, outcome }, transaction: t }) || await Share.create({ userId: buyer.id, marketId, outcome, quantity: 0 }, { transaction: t });
          buyerShare.quantity += quantity;
          await buyerShare.save({ transaction: t });

          // Emirlerin durumunu 'FILLED' (tamamlandı) olarak güncelle
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

      // Her şey yolunda gittiyse, transaction'ı onayla.
      await t.commit();

      return newOrder;

    } catch (error) {
      // Herhangi bir adımda hata olursa, tüm değişiklikleri geri al.
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new OrderService();