// src/services/share.service.js
const db = require('../models');
const { User, Market, Share } = db; // Transaction'ı buradan kaldırdık

class ShareService {
  async purchase(userId, marketId, outcome, quantity) {
    // Bir transaction başlatıyoruz (Bu, User ve Share tablolarının tutarlılığı için hala gerekli)
    const t = await db.sequelize.transaction();

    try {
      // --- KONTROLLER ---
      if (quantity <= 0) {
        throw new Error('Miktar 0\'dan büyük olmalıdır.');
      }

      const market = await Market.findByPk(marketId, { lock: t.LOCK.UPDATE });
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE });

      if (!market) throw new Error('Pazar bulunamadı.');
      if (market.status !== 'open') throw new Error('Bu pazar artık bahise açık değil.');
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      // Basit bir fiyatlandırma: Her hisse 1 TL.
      const totalCost = quantity * 1.00;

      if (user.balance < totalCost) {
        throw new Error('Yetersiz bakiye.');
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
      // Hata olursa, tüm değişiklikleri geri al.
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new ShareService();