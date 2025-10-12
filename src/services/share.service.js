// src/services/share.service.js
const db = require('../models');
const { User, Market, Share } = db;
const ApiError = require('../utils/apiError');

class ShareService {
  async purchase(userId, marketId, outcome, quantity) {
    // Bir transaction başlatıyoruz (Bu, User ve Share tablolarının tutarlılığı için hala gerekli)
    const t = await db.sequelize.transaction();

    try {
      // --- KONTROLLER ---
      if (quantity <= 0) {
        throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır.');
      }

      const market = await Market.findByPk(marketId, { lock: t.LOCK.UPDATE, transaction: t });
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });

      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (market.status !== 'open') throw ApiError.badRequest('Bu pazar artık bahise açık değil.');
      if (!user) throw ApiError.notFound('Kullanıcı bulunamadı.');

      // Basit bir fiyatlandırma: Her hisse 1 TL.
      const totalCost = quantity * 1.00;

      if (user.balance < totalCost) {
        throw ApiError.badRequest('Yetersiz bakiye.');
      }

      // --- İŞLEMLER ---

      // 1. Kullanıcının bakiyesini düşür
      user.balance -= totalCost;
      await user.save({ transaction: t });

      // 2. Yeni bir hisse kaydı oluştur
      await Share.create({
        userId,
        marketId,
        outcome,
        quantity
      }, { transaction: t });

      // Her şey yolunda gittiyse, transaction'ı onayla.
      await t.commit();

      return { newBalance: user.balance };

    } catch (error) {

      await t.rollback();
      throw error;
    }
  }

  // Admin tarafından kullanıcıya direkt hisse ekleme (test/demo için)
  async addSharesAdmin(userId, marketId, outcome, quantity) {
    const t = await db.sequelize.transaction();

    try {
      // Kontroller
      if (quantity <= 0) {
        throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır.');
      }

      const market = await Market.findByPk(marketId, { transaction: t });
      const user = await User.findByPk(userId, { transaction: t });

      if (!market) throw ApiError.notFound('Pazar bulunamadı.');
      if (!user) throw ApiError.notFound('Kullanıcı bulunamadı.');

      // Mevcut hisse kaydını bul veya yeni oluştur
      let share = await Share.findOne({
        where: { userId, marketId, outcome },
        transaction: t
      });

      if (share) {
        // Mevcut hisseyi güncelle
        share.quantity += quantity;
        await share.save({ transaction: t });
      } else {
        // Yeni hisse kaydı oluştur
        share = await Share.create({
          userId,
          marketId,
          outcome,
          quantity
        }, { transaction: t });
      }

      await t.commit();

      return { 
        share,
        message: `${quantity} adet ${outcome ? 'EVET' : 'HAYIR'} hissesi eklendi.`
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new ShareService();