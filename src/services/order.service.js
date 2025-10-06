// src/services/order.service.js
const { Order, User, Market } = require('../models');

class OrderService {
  async createOrder(orderData) {
    const { userId, marketId, type, outcome, quantity, price } = orderData;

    // Temel doğrulamalar
    if (!marketId || !type || !outcome === null || !quantity || !price) {
      throw new Error('Eksik bilgi: marketId, type, outcome, quantity ve price zorunludur.');
    }
    if (price <= 0 || price >= 1) {
        throw new Error('Fiyat 0 ile 1 arasında olmalıdır.');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    const market = await Market.findByPk(marketId);
    if (!market || market.status !== 'open') {
      throw new Error('Pazar bulunamadı veya işlem için açık değil.');
    }

    // Şimdilik sadece emri oluşturuyoruz. Bakiye kontrolü ve eşleştirme daha sonra eklenecek.
    const newOrder = await Order.create({
      userId,
      marketId,
      type,
      outcome,
      quantity,
      price,
      status: 'OPEN'
    });

    return newOrder;
  }
}

module.exports = new OrderService();