// src/services/order.service.js
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

        // TODO: Eşleştirme mantığı buraya eklenecek.
        // Şimdilik sadece yeni emri oluşturuyoruz.
        newOrder = await Order.create({ userId, marketId, type, outcome, quantity, price, status: 'OPEN' }, { transaction: t });

      } else if (type === 'SELL') {
        // TODO: Satış emri mantığı bur