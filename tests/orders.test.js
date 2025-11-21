// tests/orders.test.js
const request = require('supertest');
const express = require('express');
const orderRoutes = require('../src/routes/order.route');
const orderService = require('../src/services/order.service');

// Mock the auth middleware
jest.mock('../src/middlewares/auth.middleware', () => (req, res, next) => {
  req.user = { id: 'test-user-id' };
  next();
});

// Mock the order service
jest.mock('../src/services/order.service');

describe('Order Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/orders', orderRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return order details successfully', async () => {
      const mockOrder = {
        id: 'order-123',
        userId: 'test-user-id',
        marketId: 'market-123',
        type: 'BUY',
        outcome: true,
        quantity: 100,
        price: '0.65',
        status: 'OPEN',
        Market: {
          id: 'market-123',
          title: 'Test Market',
          status: 'open'
        },
        filled_quantity: 50,
        remaining_quantity: 50
      };

      orderService.getOrderById.mockResolvedValue(mockOrder);

      const response = await request(app)
        .get('/api/v1/orders/order-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockOrder);
      expect(orderService.getOrderById).toHaveBeenCalledWith('order-123', 'test-user-id');
    });

    it('should return 404 if order not found', async () => {
      const error = new Error('Emir bulunamadı.');
      error.statusCode = 404;
      orderService.getOrderById.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/v1/orders/nonexistent')
        .expect(404);

      expect(orderService.getOrderById).toHaveBeenCalledWith('nonexistent', 'test-user-id');
    });
  });

  describe('PATCH /api/v1/orders/:id', () => {
    it('should update order price successfully', async () => {
      const mockUpdatedOrder = {
        id: 'order-123',
        marketId: 'market-123',
        type: 'BUY',
        outcome: true,
        quantity: 100,
        price: '0.68',
        status: 'OPEN',
        updated_at: new Date()
      };

      orderService.amendOrder.mockResolvedValue(mockUpdatedOrder);

      const response = await request(app)
        .patch('/api/v1/orders/order-123')
        .send({ price: 0.68 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.price).toBe('0.68');
      expect(orderService.amendOrder).toHaveBeenCalledWith(
        'order-123',
        'test-user-id',
        { price: 0.68 }
      );
    });

    it('should update order quantity successfully', async () => {
      const mockUpdatedOrder = {
        id: 'order-123',
        marketId: 'market-123',
        type: 'BUY',
        outcome: true,
        quantity: 150,
        price: '0.65',
        status: 'OPEN',
        updated_at: new Date()
      };

      orderService.amendOrder.mockResolvedValue(mockUpdatedOrder);

      const response = await request(app)
        .patch('/api/v1/orders/order-123')
        .send({ quantity: 150 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.quantity).toBe(150);
      expect(orderService.amendOrder).toHaveBeenCalledWith(
        'order-123',
        'test-user-id',
        { quantity: 150 }
      );
    });

    it('should update both price and quantity', async () => {
      const mockUpdatedOrder = {
        id: 'order-123',
        marketId: 'market-123',
        type: 'BUY',
        outcome: true,
        quantity: 200,
        price: '0.70',
        status: 'OPEN',
        updated_at: new Date()
      };

      orderService.amendOrder.mockResolvedValue(mockUpdatedOrder);

      const response = await request(app)
        .patch('/api/v1/orders/order-123')
        .send({ price: 0.70, quantity: 200 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.price).toBe('0.70');
      expect(response.body.data.quantity).toBe(200);
    });

    it('should return 400 if order cannot be modified', async () => {
      const error = new Error('Emir bulunamadı veya güncellenebilir durumda değil.');
      error.statusCode = 404;
      orderService.amendOrder.mockRejectedValue(error);

      await request(app)
        .patch('/api/v1/orders/order-123')
        .send({ price: 0.68 })
        .expect(404);
    });

    it('should return 400 if insufficient balance', async () => {
      const error = new Error('Yetersiz bakiye.');
      error.statusCode = 400;
      orderService.amendOrder.mockRejectedValue(error);

      await request(app)
        .patch('/api/v1/orders/order-123')
        .send({ quantity: 500 })
        .expect(400);
    });
  });

  describe('POST /api/v1/orders/batch', () => {
    it('should create multiple orders successfully', async () => {
      const mockResult = {
        success: [
          { orderId: 'order-1', marketId: 'market-1', status: 'OPEN' },
          { orderId: 'order-2', marketId: 'market-2', status: 'OPEN' }
        ],
        failed: []
      };

      orderService.createBatchOrders.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/orders/batch')
        .send({
          orders: [
            { marketId: 'market-1', type: 'BUY', outcome: true, quantity: 100, price: 0.65 },
            { marketId: 'market-2', type: 'BUY', outcome: true, quantity: 50, price: 0.55 }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toHaveLength(2);
      expect(response.body.data.failed).toHaveLength(0);
      expect(orderService.createBatchOrders).toHaveBeenCalledWith(
        'test-user-id',
        expect.arrayContaining([
          expect.objectContaining({ marketId: 'market-1' }),
          expect.objectContaining({ marketId: 'market-2' })
        ])
      );
    });

    it('should handle partial success', async () => {
      const mockResult = {
        success: [
          { orderId: 'order-1', marketId: 'market-1', status: 'OPEN' }
        ],
        failed: [
          {
            marketId: 'market-2',
            type: 'BUY',
            error: 'Yetersiz bakiye.',
            code: 'VALIDATION_ERROR'
          }
        ]
      };

      orderService.createBatchOrders.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/orders/batch')
        .send({
          orders: [
            { marketId: 'market-1', type: 'BUY', outcome: true, quantity: 100, price: 0.65 },
            { marketId: 'market-2', type: 'BUY', outcome: true, quantity: 1000, price: 0.55 }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toHaveLength(1);
      expect(response.body.data.failed).toHaveLength(1);
      expect(response.body.data.failed[0].error).toBe('Yetersiz bakiye.');
    });

    it('should reject empty order array', async () => {
      const error = new Error('En az bir emir belirtilmelidir.');
      error.statusCode = 400;
      orderService.createBatchOrders.mockRejectedValue(error);

      await request(app)
        .post('/api/v1/orders/batch')
        .send({ orders: [] })
        .expect(400);
    });

    it('should reject more than 15 orders', async () => {
      const error = new Error('Bir seferde en fazla 15 emir oluşturulabilir.');
      error.statusCode = 400;
      orderService.createBatchOrders.mockRejectedValue(error);

      const orders = Array(16).fill({
        marketId: 'market-1',
        type: 'BUY',
        outcome: true,
        quantity: 10,
        price: 0.65
      });

      await request(app)
        .post('/api/v1/orders/batch')
        .send({ orders })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/orders/batch', () => {
    it('should cancel multiple orders successfully', async () => {
      const mockResult = {
        cancelled: ['order-1', 'order-2', 'order-3'],
        failed: []
      };

      orderService.cancelBatchOrders.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/v1/orders/batch')
        .send({ order_ids: ['order-1', 'order-2', 'order-3'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cancelled).toHaveLength(3);
      expect(response.body.data.failed).toHaveLength(0);
      expect(orderService.cancelBatchOrders).toHaveBeenCalledWith(
        'test-user-id',
        ['order-1', 'order-2', 'order-3']
      );
    });

    it('should handle partial cancellation failure', async () => {
      const mockResult = {
        cancelled: ['order-1', 'order-3'],
        failed: [
          { order_id: 'order-2', error: 'Sadece açık emirler iptal edilebilir.' }
        ]
      };

      orderService.cancelBatchOrders.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/v1/orders/batch')
        .send({ order_ids: ['order-1', 'order-2', 'order-3'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cancelled).toHaveLength(2);
      expect(response.body.data.failed).toHaveLength(1);
      expect(response.body.data.failed[0].order_id).toBe('order-2');
    });

    it('should reject empty order_ids array', async () => {
      const error = new Error('En az bir emir ID\'si belirtilmelidir.');
      error.statusCode = 400;
      orderService.cancelBatchOrders.mockRejectedValue(error);

      await request(app)
        .delete('/api/v1/orders/batch')
        .send({ order_ids: [] })
        .expect(400);
    });

    it('should reject more than 50 orders', async () => {
      const error = new Error('Bir seferde en fazla 50 emir iptal edilebilir.');
      error.statusCode = 400;
      orderService.cancelBatchOrders.mockRejectedValue(error);

      const orderIds = Array(51).fill('order-id');

      await request(app)
        .delete('/api/v1/orders/batch')
        .send({ order_ids: orderIds })
        .expect(400);
    });

    it('should handle all orders failing', async () => {
      const mockResult = {
        cancelled: [],
        failed: [
          { order_id: 'order-1', error: 'Emir bulunamadı.' },
          { order_id: 'order-2', error: 'Emir bulunamadı.' }
        ]
      };

      orderService.cancelBatchOrders.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/v1/orders/batch')
        .send({ order_ids: ['order-1', 'order-2'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cancelled).toHaveLength(0);
      expect(response.body.data.failed).toHaveLength(2);
    });
  });
});
