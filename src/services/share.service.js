// src/services/share.service.js
const db = require('../models');
const { User, Market, Share, Transaction } = db;

class ShareService {
  async purchase(userId, marketId, outcome, quantity) {
    // Bir transaction başlatıyoruz.
    const t = await db.sequelize.transaction();

    try {
      // --- KONTROLLER ---
      if (quantity <= 0) {
        throw new Error('Miktar 0\'dan büyük olmalıdır.');
      }

      // İlgili pazarı ve kullanıcıyı veritabanından bul.
      // 'lock: t.LOCK.UPDATE' satırı, bu kayıtların transaction bitene kadar
      // başka bir işlem tarafından değiştirilmesini engeller. Bu çok önemlidir.
      const market = await Market.findByPk(marketId, { lock: t.LOCK.UPDATE });
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE });

      if (!market) {
        throw new Error('Pazar bulunamadı.');
      }
      if (market.status !== 'open') {
        throw new Error('Bu pazar artık bahise açık değil.');
      }
      if (!user) {
        throw new Error('Kullanıcı bulunamadı.');
      }

      // Basit bir fiyatlandırma varsayımı yapıyoruz: Her hisse 1 TL.
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

      // 3. Bu işlemi bir transaction olarak kaydet
      await Transaction.create({
        userId,
        marketId,
        type: 'bet',
        amount: -totalCost, // Harcama olduğu için negatif
        description: `${quantity} adet ${outcome ? 'EVET' : 'HAYIR'} hissesi alındı.`
      }, { transaction: t });

      // Her şey yolunda gittiyse, transaction'ı onayla.
      await t.commit();

      // Başarılı sonuç olarak kullanıcının yeni bakiyesini dön
      return { newBalance: user.balance };

    } catch (error) {
      // Herhangi bir adımda hata olursa, tüm değişiklikleri geri al.
      await t.rollback();
      // Hatayı bir üst katmana (controller'a) fırlat
      throw error;
    }
  }
}

module.exports = new ShareService();