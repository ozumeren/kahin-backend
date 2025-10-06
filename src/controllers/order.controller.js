// src/controllers/order.controller.js
const orderService = require('../services/order.service');

class OrderController {
  async createOrder(req, res) {
    try {
      const orderData = {
        ...req.body,
        userId: req.user.id // userId'yi middleware'den alıyoruz
      };

      const newOrder = await orderService.createOrder(orderData);
      res.status(201).json(newOrder);
    } catch (error) {
      res.status(400).json({ message: 'Emir oluşturulurken bir hata oluştu.', error: error.message });
    }
  }
}
module.exports = new OrderController();