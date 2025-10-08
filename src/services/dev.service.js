// src/services/dev.service.js
const db = require('../models');
const { User, Market, Share, Order, Transaction, sequelize } = db;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
      
      const users = await User.bulkCreate([
        { 
          username: 'admin', 
          email: 'admin@kahin.com', 
          password: hashedPassword, 
          balance: 10000.00,
          role: 'admin' // Admin kullanıcı
        },
        { 
          username: 'alici', 
          email: 'alici@kahin.com', 
          password: hashedPassword, 
          balance: 1000.00,
          role: 'user'
        },
        { 
          username: 'satici', 
          email: 'satici@kahin.com', 
          password: hashedPassword, 
          balance: 1000.00,
          role: 'user'
        }
      ], { transaction: t, returning: true });

      const [admin, alici, satici] = users;

      // 3. Test pazarları oluştur
      const markets = await Market.bulkCreate([
        {
          title: "Bitcoin 2025 Yılında 100.000$ Olacak mı?",
          description: "Bitcoin'in 2025 yıl sonu itibariyle 100.000 doların üzerinde olup olmayacağı",
          closing_date: "2025-12-31T23:59:59Z",
          status: 'open'
        },
        {
          title: "Türkiye 2026 Dünya Kupası'na Katılacak mı?",
          description: "Türkiye Milli Takımı 2026 Dünya Kupası finallerine katılabilecek mi?",
          closing_date: "2026-06-30T23:59:59Z",
          status: 'open'
        }
      ], { transaction: t, returning: true });

      const [market1, market2] = markets;

      // 4. Satıcı'ya hisse ver
      await Share.create({
        userId: satici.id,
        marketId: market1.id,
        outcome: true, // "Evet" hissesi
        quantity: 100
      }, { transaction: t });

      // 5. Token'ları oluştur
      const adminToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      const aliciToken = jwt.sign({ id: alici.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      const saticiToken = jwt.sign({ id: satici.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      await t.commit();
      
      return { 
        message: 'Test ortamı başarıyla kuruldu!', 
        users: {
          admin: {
            id: admin.id,
            username: admin.username,
            role: admin.role,
            token: adminToken
          },
          alici: {
            id: alici.id,
            username: alici.username,
            role: alici.role,
            token: aliciToken
          },
          satici: {
            id: satici.id,
            username: satici.username,
            role: satici.role,
            token: saticiToken
          }
        },
        markets: {
          market1: {
            id: market1.id,
            title: market1.title
          },
          market2: {
            id: market2.id,
            title: market2.title
          }
        },
        credentials: {
          email: 'admin@kahin.com / alici@kahin.com / satici@kahin.com',
          password: '123'
        }
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new DevService();