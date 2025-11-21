// src/controllers/order.controller.js
const orderService = require('../services/order.service');

class OrderController {
  async createOrder(req, res, next) {
    try {
      const orderData = {
        ...req.body,
        userId: req.user.id // userId'yi middleware'den alıyoruz
      };

      const newOrder = await orderService.createOrder(orderData);
      res.status(201).json({
        success: true,
        ...newOrder
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await orderService.cancelOrder(id, userId);
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyOrders(req, res, next) {
    try {
      const userId = req.user.id;
      const filters = {
        status: req.query.status,
        marketId: req.query.marketId,
        type: req.query.type
      };

      const orders = await orderService.getUserOrders(userId, filters);
      res.status(200).json({
        success: true,
        count: orders.length,
        data: orders
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const order = await orderService.getOrderById(id, userId);
      res.status(200).json({
        success: true,
        data: order
      });
    } catch (error) {
      next(error);
    }
  }

  async amendOrder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { price, quantity } = req.body;

      const updatedOrder = await orderService.amendOrder(id, userId, { price, quantity });
      res.status(200).json({
        success: true,
        data: updatedOrder
      });
    } catch (error) {
      next(error);
    }
  }

  async createBatchOrders(req, res, next) {
    try {
      const { orders } = req.body;
      const userId = req.user.id;

      const result = await orderService.createBatchOrders(userId, orders);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelBatchOrders(req, res, next) {
    try {
      const { order_ids } = req.body;
      const userId = req.user.id;

      const result = await orderService.cancelBatchOrders(userId, order_ids);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrderController();