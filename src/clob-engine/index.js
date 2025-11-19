/**
 * CLOB (Central Limit Order Book) Engine
 *
 * Ana API'den ayrı çalışan, yüksek performanslı emir eşleştirme motoru.
 *
 * Bileşenler:
 * - Sequencer: Emirlerin adil sıralanması
 * - Matching Engine: Bellek içi eşleştirme
 * - Persistence: Event sourcing ve WAL
 * - Risk Engine: Bakiye ve marj kontrolü
 * - Market Data: WebSocket üzerinden gerçek zamanlı dağıtım
 */

const http = require('http');
const WebSocket = require('ws');
const { Sequencer } = require('./sequencer');
const { MatchingEngine } = require('./matching-engine');
const { PersistenceManager } = require('./persistence');
const { RiskEngine } = require('./risk-engine');
const { MarketDataPublisher } = require('./market-data');
const { CLOBApiServer } = require('./api');
const { EventEmitter } = require('events');

class CLOBEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      port: config.port || 3001,
      wsPort: config.wsPort || 3002,
      walPath: config.walPath || './data/wal',
      snapshotPath: config.snapshotPath || './data/snapshots',
      snapshotInterval: config.snapshotInterval || 10000, // Her 10000 emirde bir snapshot
      maxOrdersPerSecond: config.maxOrdersPerSecond || 10000,
      ...config
    };

    this.isRunning = false;
    this.stats = {
      totalOrders: 0,
      totalTrades: 0,
      totalVolume: 0,
      startTime: null,
      lastSequenceNumber: 0
    };

    // Bileşenleri başlat
    this._initializeComponents();
  }

  _initializeComponents() {
    // Event Sourcing ve Persistence
    this.persistence = new PersistenceManager({
      walPath: this.config.walPath,
      snapshotPath: this.config.snapshotPath,
      snapshotInterval: this.config.snapshotInterval
    });

    // Risk Engine
    this.riskEngine = new RiskEngine({
      persistence: this.persistence
    });

    // Matching Engine (bellek içi)
    this.matchingEngine = new MatchingEngine({
      riskEngine: this.riskEngine
    });

    // Sequencer
    this.sequencer = new Sequencer({
      matchingEngine: this.matchingEngine,
      persistence: this.persistence,
      riskEngine: this.riskEngine,
      maxOrdersPerSecond: this.config.maxOrdersPerSecond
    });

    // Market Data Publisher
    this.marketData = new MarketDataPublisher();

    // Event bağlantıları
    this._setupEventHandlers();
  }

  _setupEventHandlers() {
    // Sequencer olayları
    this.sequencer.on('orderSequenced', (event) => {
      this.stats.totalOrders++;
      this.stats.lastSequenceNumber = event.sequenceNumber;
      this.emit('orderSequenced', event);
    });

    this.sequencer.on('orderRejected', (event) => {
      this.emit('orderRejected', event);
    });

    // Matching Engine olayları
    this.matchingEngine.on('trade', (trade) => {
      this.stats.totalTrades++;
      this.stats.totalVolume += trade.quantity * trade.price;

      // Persistence'a kaydet
      this.persistence.logEvent({
        type: 'TRADE',
        data: trade,
        timestamp: Date.now()
      });

      // Market data yayınla
      this.marketData.publishTrade(trade);
      this.emit('trade', trade);
    });

    this.matchingEngine.on('orderBookUpdate', (update) => {
      this.marketData.publishOrderBookUpdate(update);
      this.emit('orderBookUpdate', update);
    });

    this.matchingEngine.on('orderFilled', (order) => {
      this.persistence.logEvent({
        type: 'ORDER_FILLED',
        data: order,
        timestamp: Date.now()
      });
      this.emit('orderFilled', order);
    });

    this.matchingEngine.on('orderPartialFill', (order) => {
      this.persistence.logEvent({
        type: 'ORDER_PARTIAL_FILL',
        data: order,
        timestamp: Date.now()
      });
      this.emit('orderPartialFill', order);
    });

    // Risk Engine olayları
    this.riskEngine.on('balanceUpdated', (update) => {
      this.emit('balanceUpdated', update);
    });

    this.riskEngine.on('riskLimitBreached', (alert) => {
      this.emit('riskLimitBreached', alert);
    });
  }

  async start() {
    if (this.isRunning) {
      throw new Error('CLOB Engine zaten çalışıyor');
    }

    console.log('CLOB Engine başlatılıyor...');

    try {
      // Persistence'ı başlat ve durumu kurtarması
      await this.persistence.initialize();

      // Önceki durumu yükle (Event Sourcing replay)
      const state = await this.persistence.loadLatestState();
      if (state) {
        await this._restoreState(state);
        console.log(`Durum kurtarıldı: ${state.sequenceNumber} emirden`);
      }

      // Risk Engine'i başlat
      await this.riskEngine.initialize();

      // Matching Engine'i başlat
      await this.matchingEngine.initialize();

      // Sequencer'ı başlat
      await this.sequencer.start();

      // HTTP API sunucusunu başlat
      this.apiServer = new CLOBApiServer(this);
      await this.apiServer.start(this.config.port);

      // WebSocket sunucusunu başlat
      await this._startWebSocketServer();

      this.isRunning = true;
      this.stats.startTime = Date.now();

      console.log(`CLOB Engine başlatıldı`);
      console.log(`  - API: http://localhost:${this.config.port}`);
      console.log(`  - WebSocket: ws://localhost:${this.config.wsPort}`);

      this.emit('started');
    } catch (error) {
      console.error('CLOB Engine başlatma hatası:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('CLOB Engine durduruluyor...');

    try {
      // Sequencer'ı durdur (yeni emir kabul etme)
      await this.sequencer.stop();

      // Bekleyen işlemleri tamamla
      await this.matchingEngine.flush();

      // Son durumu kaydet
      await this.persistence.saveSnapshot({
        sequenceNumber: this.stats.lastSequenceNumber,
        orderBooks: this.matchingEngine.getOrderBooks(),
        balances: this.riskEngine.getBalances(),
        timestamp: Date.now()
      });

      // WebSocket sunucusunu kapat
      if (this.wss) {
        this.wss.close();
      }

      // API sunucusunu kapat
      if (this.apiServer) {
        await this.apiServer.stop();
      }

      // Persistence'ı kapat
      await this.persistence.close();

      this.isRunning = false;
      console.log('CLOB Engine durduruldu');

      this.emit('stopped');
    } catch (error) {
      console.error('CLOB Engine durdurma hatası:', error);
      throw error;
    }
  }

  async _startWebSocketServer() {
    const server = http.createServer();
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws) => {
      console.log('Yeni WebSocket bağlantısı');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({ error: 'Geçersiz mesaj formatı' }));
        }
      });

      ws.on('close', () => {
        this.marketData.unsubscribeAll(ws);
      });

      // Hoş geldin mesajı
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'CLOB Engine WebSocket bağlantısı kuruldu'
      }));
    });

    return new Promise((resolve) => {
      server.listen(this.config.wsPort, () => {
        resolve();
      });
    });
  }

  _handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        if (data.channel === 'orderbook') {
          this.marketData.subscribeOrderBook(ws, data.marketId, data.outcome);
          // Mevcut order book'u gönder
          const orderBook = this.matchingEngine.getOrderBook(data.marketId, data.outcome);
          ws.send(JSON.stringify({
            type: 'orderbook_snapshot',
            marketId: data.marketId,
            outcome: data.outcome,
            data: orderBook
          }));
        } else if (data.channel === 'trades') {
          this.marketData.subscribeTrades(ws, data.marketId);
        }
        break;

      case 'unsubscribe':
        if (data.channel === 'orderbook') {
          this.marketData.unsubscribeOrderBook(ws, data.marketId, data.outcome);
        } else if (data.channel === 'trades') {
          this.marketData.unsubscribeTrades(ws, data.marketId);
        }
        break;

      default:
        ws.send(JSON.stringify({ error: 'Bilinmeyen mesaj tipi' }));
    }
  }

  async _restoreState(state) {
    // Order book'ları yükle
    if (state.orderBooks) {
      await this.matchingEngine.restoreOrderBooks(state.orderBooks);
    }

    // Bakiyeleri yükle
    if (state.balances) {
      await this.riskEngine.restoreBalances(state.balances);
    }

    // Sequence number'ı güncelle
    this.stats.lastSequenceNumber = state.sequenceNumber || 0;
    this.sequencer.setSequenceNumber(state.sequenceNumber || 0);
  }

  // Public API metodları
  async submitOrder(order) {
    if (!this.isRunning) {
      throw new Error('CLOB Engine çalışmıyor');
    }
    return this.sequencer.submitOrder(order);
  }

  async cancelOrder(orderId, userId) {
    if (!this.isRunning) {
      throw new Error('CLOB Engine çalışmıyor');
    }
    return this.sequencer.cancelOrder(orderId, userId);
  }

  getOrderBook(marketId, outcome) {
    return this.matchingEngine.getOrderBook(marketId, outcome);
  }

  getUserBalance(userId) {
    return this.riskEngine.getBalance(userId);
  }

  getUserPositions(userId) {
    return this.riskEngine.getPositions(userId);
  }

  getStats() {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.stats.startTime : 0,
      ordersPerSecond: this.sequencer.getOrdersPerSecond(),
      pendingOrders: this.sequencer.getPendingOrderCount()
    };
  }

  getMarketStats(marketId) {
    return this.matchingEngine.getMarketStats(marketId);
  }
}

// Standalone mod için
if (require.main === module) {
  const engine = new CLOBEngine({
    port: process.env.CLOB_PORT || 3001,
    wsPort: process.env.CLOB_WS_PORT || 3002
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nKapatma sinyali alındı...');
    await engine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await engine.stop();
    process.exit(0);
  });

  engine.start().catch((error) => {
    console.error('CLOB Engine başlatılamadı:', error);
    process.exit(1);
  });
}

module.exports = { CLOBEngine };
