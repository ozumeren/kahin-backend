// src/controllers/order.controller.js
const orderService = require('../services/order.service');

class OrderController {
  /**
   * Create a new order
   * Supports: LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT, STOP_LIMIT
   * Time-in-force: GTC, GTD, IOC, FOK
   */
  async createOrder(req, res, next) {
    try {
      const {
        marketId,
        type,
        outcome,
        quantity,
        price,
        order_type = 'LIMIT',
        time_in_force = 'GTC',
        expires_at,
        trigger_price
      } = req.body;

      const orderData = {
        userId: req.user.id,
        marketId,
        type,
        outcome,
        quantity,
        price,
        order_type,
        time_in_force,
        expires_at,
        trigger_price
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

  /**
   * Get user's conditional orders (stop-loss, take-profit)
   */
  async getConditionalOrders(req, res, next) {
    try {
      const userId = req.user.id;
      const { marketId } = req.query;

      const orders = await orderService.getConditionalOrders(userId, marketId);
      res.status(200).json({
        success: true,
        count: orders.length,
        data: orders
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