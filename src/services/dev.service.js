// src/services/dev.service.js
const db = require('../models');
const { User, Market, Share, Order, Transaction, sequelize } = db;
const bcrypt = require('bcryptjs'); // bcrypt'i import ediyoruz
const jwt = require('jsonwebtoken'); // jwt'yi import ediyoruz

class DevService {
  async setupTestEnvironment() {
    const t = await sequelize.transaction();
    try {
      // 1. Tüm eski verileri temizle
      await Order.destroy({ where: {}, transaction: t, cascade: true });
      await Share.destroy({ where: {}, transaction: t, cascade: true });
      await Transaction.destroy({ where: {}, transaction: t, cascade: true });
      await Market.destroy({ where: {}, transaction: t, cascade: true });
      await User.destroy({ where: {}, transaction: t, cascade: true });

      // 2. Test kullanıcılarını oluştur
      const hashedPassword = await bcrypt.hash('123', 10);
      const [alici, satici] = await User.bulkCreate([
        { username: 'alici', email: 'alici@kahin.com', password: hashedPassword, balance: 100.00 },
        { username: 'satici', email: 'satici@kahin.com', password: hashedPassword, balance: 100.00 }
      ], { transaction: t, returning: true }); // 'returning: true' objelerin tamamını döndürür

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
      
      // --- YENİ EKLENEN KISIM: TOKEN OLUŞTURMA ---
      const aliciToken = jwt.sign({ id: alici.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
      const saticiToken = jwt.sign({ id: satici.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
      // ------------------------------------------

      await t.commit();
      
      // Cevap olarak ID'ler yerine Token'ları dön
      return { 
        message: 'Test ortamı başarıyla kuruldu! Tokenlar hazır.', 
        marketId: market.id, 
        aliciToken, 
        saticiToken 
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}
module.exports = new DevService();