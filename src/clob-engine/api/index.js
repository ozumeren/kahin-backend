/**
 * CLOB API Server
 *
 * CLOB Engine için HTTP REST API.
 * Ana API'den ayrı port'ta çalışır.
 */

const http = require('http');
const url = require('url');

class CLOBApiServer {
  constructor(engine) {
    this.engine = engine;
    this.server = null;
  }

  async start(port) {
    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });

    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`CLOB API sunucusu başlatıldı: http://localhost:${port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('CLOB API sunucusu kapatıldı');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async _handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;

    try {
      // Route matching
      if (path === '/health' && req.method === 'GET') {
        return this._sendJson(res, { status: 'ok', service: 'clob-engine' });
      }

      if (path === '/stats' && req.method === 'GET') {
        return this._handleGetStats(req, res);
      }

      if (path === '/orders' && req.method === 'POST') {
        return this._handleCreateOrder(req, res);
      }

      if (path.match(/^\/orders\/[^/]+$/) && req.method === 'DELETE') {
        const orderId = path.split('/')[2];
        return this._handleCancelOrder(req, res, orderId);
      }

      if (path === '/orderbook' && req.method === 'GET') {
        return this._handleGetOrderBook(req, res, query);
      }

      if (path.match(/^\/markets\/[^/]+\/stats$/) && req.method === 'GET') {
        const marketId = path.split('/')[2];
        return this._handleGetMarketStats(req, res, marketId);
      }

      if (path.match(/^\/users\/[^/]+\/balance$/) && req.method === 'GET') {
        const userId = path.split('/')[2];
        return this._handleGetBalance(req, res, userId);
      }

      if (path.match(/^\/users\/[^/]+\/balance$/) && req.method === 'POST') {
        const userId = path.split('/')[2];
        return this._handleSetBalance(req, res, userId);
      }

      if (path.match(/^\/users\/[^/]+\/positions$/) && req.method === 'GET') {
        const userId = path.split('/')[2];
        return this._handleGetPositions(req, res, userId);
      }

      if (path.match(/^\/users\/[^/]+\/positions$/) && req.method === 'POST') {
        const userId = path.split('/')[2];
        return this._handleSetPosition(req, res, userId);
      }

      // 404
      this._sendError(res, 404, 'Endpoint bulunamadı');
    } catch (error) {
      console.error('API hatası:', error);
      this._sendError(res, 500, error.message);
    }
  }

  /**
   * İstatistikleri getir
   */
  _handleGetStats(req, res) {
    const stats = this.engine.getStats();
    this._sendJson(res, stats);
  }

  /**
   * Yeni emir oluştur
   */
  async _handleCreateOrder(req, res) {
    const body = await this._parseBody(req);

    if (!body) {
      return this._sendError(res, 400, 'Geçersiz JSON body');
    }

    const order = {
      userId: body.userId,
      marketId: body.marketId,
      type: body.type,
      outcome: body.outcome,
      quantity: body.quantity,
      price: body.price
    };

    const result = await this.engine.submitOrder(order);

    if (result.success) {
      this._sendJson(res, result, 201);
    } else {
      this._sendError(res, 400, result.message, result);
    }
  }

  /**
   * Emri iptal et
   */
  async _handleCancelOrder(req, res, orderId) {
    const body = await this._parseBody(req);

    if (!body || !body.userId) {
      return this._sendError(res, 400, 'userId gerekli');
    }

    const result = await this.engine.cancelOrder(orderId, body.userId);

    if (result.success) {
      this._sendJson(res, result);
    } else {
      this._sendError(res, 400, result.message, result);
    }
  }

  /**
   * Order book'u getir
   */
  _handleGetOrderBook(req, res, query) {
    if (!query.marketId) {
      return this._sendError(res, 400, 'marketId query parametresi gerekli');
    }

    const outcome = query.outcome === 'false' ? false : true;
    const depth = parseInt(query.depth) || 10;

    const orderBook = this.engine.getOrderBook(query.marketId, outcome, depth);
    this._sendJson(res, orderBook);
  }

  /**
   * Market istatistiklerini getir
   */
  _handleGetMarketStats(req, res, marketId) {
    const stats = this.engine.getMarketStats(marketId);
    this._sendJson(res, stats);
  }

  /**
   * Kullanıcı bakiyesini getir
   */
  _handleGetBalance(req, res, userId) {
    const balance = this.engine.getUserBalance(userId);
    this._sendJson(res, { userId, balance });
  }

  /**
   * Kullanıcı bakiyesini ayarla
   */
  async _handleSetBalance(req, res, userId) {
    const body = await this._parseBody(req);

    if (!body || typeof body.amount !== 'number') {
      return this._sendError(res, 400, 'amount (number) gerekli');
    }

    this.engine.riskEngine.setBalance(userId, body.amount);
    const balance = this.engine.getUserBalance(userId);

    this._sendJson(res, { userId, balance });
  }

  /**
   * Kullanıcı pozisyonlarını getir
   */
  _handleGetPositions(req, res, userId) {
    const positions = this.engine.getUserPositions(userId);
    this._sendJson(res, { userId, positions });
  }

  /**
   * Kullanıcı pozisyonunu ayarla
   */
  async _handleSetPosition(req, res, userId) {
    const body = await this._parseBody(req);

    if (!body || !body.marketId || typeof body.outcome !== 'boolean' || typeof body.quantity !== 'number') {
      return this._sendError(res, 400, 'marketId, outcome (boolean), quantity (number) gerekli');
    }

    this.engine.riskEngine.setPosition(userId, body.marketId, body.outcome, body.quantity);
    const positions = this.engine.getUserPositions(userId);

    this._sendJson(res, { userId, positions });
  }

  /**
   * Request body'yi parse et
   */
  async _parseBody(req) {
    return new Promise((resolve) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * JSON response gönder
   */
  _sendJson(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Hata response'u gönder
   */
  _sendError(res, statusCode, message, extra = {}) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: message,
      ...extra
    }));
  }
}

module.exports = { CLOBApiServer };
