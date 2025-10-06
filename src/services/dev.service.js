// src/services/dev.service.js
const db = require('../models');
const { User, Market, Share, Order, Transaction, sequelize } = db;

class DevService {
  async setupTestEnvironment() {
    const t = await sequelize.transaction();
    try {
      // 1. Tüm eski verileri temizle
      await Order.destroy({ where: {}, transaction: t });
      await Share.destroy({ where: {}, transaction: t });
      await Transaction.destroy({ where: {}, transaction: t });
      await Market.destroy({ where: {}, transaction: t });
      await User.destroy({ where: {}, transaction: t });

      // 2. Test kullanıcılarını oluştur
      const hashedPassword = await require('bcryptjs').hash('123', 10);
      const [alici, satici] = await User.bulkCreate([
        { username: 'alici', email: 'alici@kahin.com', password: hashedPassword, balance: 100.00 },
        { username: 'satici', email: 'satici@kahin.com', password: hashedPassword, balance: 100.00 }
      ], { transaction: t });

      // 3. Test pazarını oluştur
      const market = await Market.create({
        title: "Otomatik Test Pazarı",
        closing_date: "2029-12-31T23:59:59Z"
      }, { transaction: t });

      // 4. Satıcı'ya hisse ver
      await Share.create({
        userId: satici.id,
        marketId: market.id,
        outcome: true, // "Evet" hissesi
        quantity: 100
      }, { transaction: t });

      await t.commit();
      return { message: 'Test ortamı başarıyla kuruldu!', marketId: market.id, aliciId: alici.id, saticiId: satici.id };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}
module.exports = new DevService();