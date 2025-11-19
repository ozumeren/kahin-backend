/**
 * Matching Engine - Eşleştirme Motoru
 *
 * Sistemin kalbi: Bellek içi çalışan, yüksek performanslı emir eşleştirme.
 * - Tamamen bellek içi (in-memory) order book
 * - Price-time priority sıralaması
 * - Deterministik işleme
 * - Self-trading koruması
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Order Book - Tek bir market/outcome için emir defteri
 */
class OrderBook {
  constructor(marketId, outcome) {
    this.marketId = marketId;
    this.outcome = outcome;

    // Bids (alış emirleri) - en yüksek fiyat önce
    this.bids = new Map(); // price -> [orders]

    // Asks (satış emirleri) - en düşük fiyat önce
    this.asks = new Map(); // price -> [orders]

    // Hızlı erişim için order index
    this.orderIndex = new Map(); // orderId -> { price, side, order }

    // İstatistikler
    this.stats = {
      totalBids: 0,
      totalAsks: 0,
      totalVolume: 0,
      tradeCount: 0,
      lastPrice: null,
      highPrice: 0,
      lowPrice: 1
    };
  }

  /**
   * Emir ekle
   */
  addOrder(order) {
    const side = order.type === 'BUY' ? 'bids' : 'asks';
    const book = this[side];
    const price = order.price;

    if (!book.has(price)) {
      book.set(price, []);
    }

    book.get(price).push(order);

    // Index'e ekle
    this.orderIndex.set(order.id, { price, side, order });

    // İstatistikleri güncelle
    if (side === 'bids') {
      this.stats.totalBids += order.quantity;
    } else {
      this.stats.totalAsks += order.quantity;
    }
  }

  /**
   * Emir kaldır
   */
  removeOrder(orderId) {
    const indexed = this.orderIndex.get(orderId);
    if (!indexed) {
      return null;
    }

    const { price, side, order } = indexed;
    const book = this[side];
    const orders = book.get(price);

    if (orders) {
      const index = orders.findIndex(o => o.id === orderId);
      if (index !== -1) {
        orders.splice(index, 1);

        // Boş fiyat seviyesini kaldır
        if (orders.length === 0) {
          book.delete(price);
        }
      }
    }

    this.orderIndex.delete(orderId);

    // İstatistikleri güncelle
    if (side === 'bids') {
      this.stats.totalBids -= order.remainingQuantity || order.quantity;
    } else {
      this.stats.totalAsks -= order.remainingQuantity || order.quantity;
    }

    return order;
  }

  /**
   * En iyi alış fiyatı
   */
  getBestBid() {
    if (this.bids.size === 0) return null;
    return Math.max(...this.bids.keys());
  }

  /**
   * En iyi satış fiyatı
   */
  getBestAsk() {
    if (this.asks.size === 0) return null;
    return Math.min(...this.asks.keys());
  }

  /**
   * Spread hesapla
   */
  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (bestBid === null || bestAsk === null) {
      return null;
    }

    return bestAsk - bestBid;
  }

  /**
   * Order book snapshot
   */
  getSnapshot(depth = 10) {
    // Bids - en yüksek fiyattan başla
    const bidPrices = Array.from(this.bids.keys()).sort((a, b) => b - a).slice(0, depth);
    const bidsSnapshot = bidPrices.map(price => ({
      price,
      quantity: this.bids.get(price).reduce((sum, o) => sum + (o.remainingQuantity || o.quantity), 0),
      orderCount: this.bids.get(price).length
    }));

    // Asks - en düşük fiyattan başla
    const askPrices = Array.from(this.asks.keys()).sort((a, b) => a - b).slice(0, depth);
    const asksSnapshot = askPrices.map(price => ({
      price,
      quantity: this.asks.get(price).reduce((sum, o) => sum + (o.remainingQuantity || o.quantity), 0),
      orderCount: this.asks.get(price).length
    }));

    return {
      marketId: this.marketId,
      outcome: this.outcome,
      bids: bidsSnapshot,
      asks: asksSnapshot,
      bestBid: this.getBestBid(),
      bestAsk: this.getBestAsk(),
      spread: this.getSpread(),
      stats: this.stats
    };
  }

  /**
   * Trade sonrası istatistikleri güncelle
   */
  recordTrade(price, quantity) {
    this.stats.tradeCount++;
    this.stats.totalVolume += quantity;
    this.stats.lastPrice = price;

    if (price > this.stats.highPrice) {
      this.stats.highPrice = price;
    }
    if (price < this.stats.lowPrice) {
      this.stats.lowPrice = price;
    }
  }
}

/**
 * Matching Engine
 */
class MatchingEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.riskEngine = config.riskEngine;

    // Market bazlı order book'lar: marketId:outcome -> OrderBook
    this.orderBooks = new Map();

    // Tüm emirler index
    this.allOrders = new Map(); // orderId -> order

    // Trade ID sayacı
    this.tradeIdCounter = 0;

    // İstatistikler
    this.stats = {
      totalTrades: 0,
      totalVolume: 0,
      marketsActive: 0
    };
  }

  async initialize() {
    console.log('Matching Engine başlatıldı');
  }

  /**
   * Emri işle ve eşleştir
   */
  async processOrder(order) {
    // Order book'u al veya oluştur
    const orderBook = this._getOrCreateOrderBook(order.marketId, order.outcome);

    // Mevcut miktarı takip et
    order.remainingQuantity = order.quantity;
    order.filledQuantity = 0;
    order.trades = [];

    if (order.type === 'BUY') {
      await this._matchBuyOrder(order, orderBook);
    } else {
      await this._matchSellOrder(order, orderBook);
    }

    // Kalan miktar varsa order book'a ekle
    if (order.remainingQuantity > 0) {
      order.status = order.filledQuantity > 0 ? 'PARTIAL' : 'OPEN';
      orderBook.addOrder(order);
      this.allOrders.set(order.id, order);

      this.emit('orderBookUpdate', {
        marketId: order.marketId,
        outcome: order.outcome,
        type: 'ADD',
        order: {
          id: order.id,
          type: order.type,
          price: order.price,
          quantity: order.remainingQuantity
        }
      });
    } else {
      order.status = 'FILLED';
      this.emit('orderFilled', order);
    }

    return order;
  }

  /**
   * Alış emrini eşleştir
   */
  async _matchBuyOrder(buyOrder, orderBook) {
    // En düşük fiyatlı satış emirlerinden başla
    const askPrices = Array.from(orderBook.asks.keys()).sort((a, b) => a - b);

    for (const askPrice of askPrices) {
      // Fiyat uygun değilse dur
      if (askPrice > buyOrder.price) {
        break;
      }

      const askOrders = orderBook.asks.get(askPrice);
      if (!askOrders || askOrders.length === 0) continue;

      // FIFO sırasıyla eşleştir
      for (let i = 0; i < askOrders.length && buyOrder.remainingQuantity > 0; i++) {
        const sellOrder = askOrders[i];

        // Self-trading kontrolü
        if (sellOrder.userId === buyOrder.userId) {
          continue;
        }

        // Trade oluştur
        const trade = await this._executeTrade(buyOrder, sellOrder, orderBook);

        if (trade) {
          buyOrder.trades.push(trade);
          sellOrder.trades = sellOrder.trades || [];
          sellOrder.trades.push(trade);

          // Satış emri tamamen dolduysa kaldır
          if (sellOrder.remainingQuantity === 0) {
            orderBook.removeOrder(sellOrder.id);
            this.allOrders.delete(sellOrder.id);
            sellOrder.status = 'FILLED';
            this.emit('orderFilled', sellOrder);
          }
        }
      }
    }
  }

  /**
   * Satış emrini eşleştir
   */
  async _matchSellOrder(sellOrder, orderBook) {
    // En yüksek fiyatlı alış emirlerinden başla
    const bidPrices = Array.from(orderBook.bids.keys()).sort((a, b) => b - a);

    for (const bidPrice of bidPrices) {
      // Fiyat uygun değilse dur
      if (bidPrice < sellOrder.price) {
        break;
      }

      const bidOrders = orderBook.bids.get(bidPrice);
      if (!bidOrders || bidOrders.length === 0) continue;

      // FIFO sırasıyla eşleştir
      for (let i = 0; i < bidOrders.length && sellOrder.remainingQuantity > 0; i++) {
        const buyOrder = bidOrders[i];

        // Self-trading kontrolü
        if (buyOrder.userId === sellOrder.userId) {
          continue;
        }

        // Trade oluştur
        const trade = await this._executeTrade(buyOrder, sellOrder, orderBook);

        if (trade) {
          sellOrder.trades.push(trade);
          buyOrder.trades = buyOrder.trades || [];
          buyOrder.trades.push(trade);

          // Alış emri tamamen dolduysa kaldır
          if (buyOrder.remainingQuantity === 0) {
            orderBook.removeOrder(buyOrder.id);
            this.allOrders.delete(buyOrder.id);
            buyOrder.status = 'FILLED';
            this.emit('orderFilled', buyOrder);
          }
        }
      }
    }
  }

  /**
   * Trade işlemini gerçekleştir
   */
  async _executeTrade(buyOrder, sellOrder, orderBook) {
    // Eşleşen miktar
    const quantity = Math.min(buyOrder.remainingQuantity, sellOrder.remainingQuantity);

    // Fiyat (satıcının fiyatı - maker gets price improvement)
    const price = sellOrder.price;

    // Trade ID oluştur
    const tradeId = `TRD-${Date.now()}-${++this.tradeIdCounter}`;

    // Trade objesi
    const trade = {
      id: tradeId,
      marketId: buyOrder.marketId,
      outcome: buyOrder.outcome,
      buyerId: buyOrder.userId,
      sellerId: sellOrder.userId,
      buyOrderId: buyOrder.id,
      sellOrderId: sellOrder.id,
      quantity,
      price,
      total: quantity * price,
      timestamp: Date.now()
    };

    // Risk Engine üzerinden bakiyeleri güncelle
    if (this.riskEngine) {
      await this.riskEngine.settleTrade(trade);
    }

    // Emirlerin miktarlarını güncelle
    buyOrder.remainingQuantity -= quantity;
    buyOrder.filledQuantity += quantity;
    sellOrder.remainingQuantity -= quantity;
    sellOrder.filledQuantity = (sellOrder.filledQuantity || 0) + quantity;

    // Order book istatistiklerini güncelle
    orderBook.recordTrade(price, quantity);
    orderBook.stats.totalBids -= quantity;
    orderBook.stats.totalAsks -= quantity;

    // Global istatistikleri güncelle
    this.stats.totalTrades++;
    this.stats.totalVolume += trade.total;

    // Trade olayını emit et
    this.emit('trade', trade);

    // Order book güncelleme olayı
    this.emit('orderBookUpdate', {
      marketId: buyOrder.marketId,
      outcome: buyOrder.outcome,
      type: 'TRADE',
      trade
    });

    // Partial fill olayları
    if (buyOrder.remainingQuantity > 0) {
      this.emit('orderPartialFill', buyOrder);
    }
    if (sellOrder.remainingQuantity > 0) {
      this.emit('orderPartialFill', sellOrder);
    }

    return trade;
  }

  /**
   * Emri iptal et
   */
  async cancelOrder(orderId, userId) {
    const order = this.allOrders.get(orderId);

    if (!order) {
      return {
        success: false,
        reason: 'NOT_FOUND',
        message: 'Emir bulunamadı'
      };
    }

    if (order.userId !== userId) {
      return {
        success: false,
        reason: 'UNAUTHORIZED',
        message: 'Bu emri iptal etme yetkiniz yok'
      };
    }

    // Order book'tan kaldır
    const orderBook = this._getOrderBook(order.marketId, order.outcome);
    if (orderBook) {
      orderBook.removeOrder(orderId);
    }

    this.allOrders.delete(orderId);

    // Risk Engine'e fonları serbest bırak
    if (this.riskEngine) {
      await this.riskEngine.unlockFunds(order);
    }

    order.status = 'CANCELLED';

    this.emit('orderCancelled', order);

    this.emit('orderBookUpdate', {
      marketId: order.marketId,
      outcome: order.outcome,
      type: 'REMOVE',
      orderId
    });

    return {
      success: true,
      order
    };
  }

  /**
   * Order book al veya oluştur
   */
  _getOrCreateOrderBook(marketId, outcome) {
    const key = `${marketId}:${outcome}`;

    if (!this.orderBooks.has(key)) {
      this.orderBooks.set(key, new OrderBook(marketId, outcome));
      this.stats.marketsActive++;
    }

    return this.orderBooks.get(key);
  }

  /**
   * Order book al
   */
  _getOrderBook(marketId, outcome) {
    const key = `${marketId}:${outcome}`;
    return this.orderBooks.get(key);
  }

  /**
   * Order book snapshot al
   */
  getOrderBook(marketId, outcome, depth = 10) {
    const orderBook = this._getOrderBook(marketId, outcome);

    if (!orderBook) {
      return {
        marketId,
        outcome,
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        spread: null,
        stats: {
          totalBids: 0,
          totalAsks: 0,
          totalVolume: 0,
          tradeCount: 0,
          lastPrice: null
        }
      };
    }

    return orderBook.getSnapshot(depth);
  }

  /**
   * Tüm order book'ları al
   */
  getOrderBooks() {
    const result = {};

    for (const [key, orderBook] of this.orderBooks) {
      result[key] = orderBook.getSnapshot();
    }

    return result;
  }

  /**
   * Order book'ları yeniden yükle (recovery)
   */
  async restoreOrderBooks(savedOrderBooks) {
    for (const [key, snapshot] of Object.entries(savedOrderBooks)) {
      const [marketId, outcome] = key.split(':');
      const orderBook = this._getOrCreateOrderBook(marketId, outcome === 'true');

      // Bids'i yeniden oluştur
      if (snapshot.bids) {
        for (const bid of snapshot.bids) {
          // Not: Tam order detayları snapshot'ta olmalı
          if (bid.orders) {
            for (const order of bid.orders) {
              orderBook.addOrder(order);
              this.allOrders.set(order.id, order);
            }
          }
        }
      }

      // Asks'i yeniden oluştur
      if (snapshot.asks) {
        for (const ask of snapshot.asks) {
          if (ask.orders) {
            for (const order of ask.orders) {
              orderBook.addOrder(order);
              this.allOrders.set(order.id, order);
            }
          }
        }
      }

      // İstatistikleri geri yükle
      if (snapshot.stats) {
        orderBook.stats = { ...snapshot.stats };
      }
    }

    console.log(`${this.orderBooks.size} order book yüklendi`);
  }

  /**
   * Market istatistikleri
   */
  getMarketStats(marketId) {
    const yesBook = this._getOrderBook(marketId, true);
    const noBook = this._getOrderBook(marketId, false);

    return {
      marketId,
      yes: yesBook ? yesBook.getSnapshot() : null,
      no: noBook ? noBook.getSnapshot() : null,
      totalVolume: (yesBook?.stats.totalVolume || 0) + (noBook?.stats.totalVolume || 0),
      totalTrades: (yesBook?.stats.tradeCount || 0) + (noBook?.stats.tradeCount || 0)
    };
  }

  /**
   * Bekleyen emirleri temizle
   */
  async flush() {
    // İşlenecek bir şey yok, tüm emirler senkron işleniyor
    console.log('Matching Engine flush tamamlandı');
  }

  /**
   * Global istatistikler
   */
  getStats() {
    return {
      ...this.stats,
      totalOrders: this.allOrders.size
    };
  }
}

module.exports = { MatchingEngine, OrderBook };
