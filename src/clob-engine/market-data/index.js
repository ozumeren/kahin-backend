/**
 * Market Data Publisher - Piyasa Veri Dağıtımı
 *
 * Emir defteri güncellemelerini ve işlemleri WebSocket üzerinden
 * gerçek zamanlı olarak kullanıcılara iletir.
 */

const { EventEmitter } = require('events');

class MarketDataPublisher extends EventEmitter {
  constructor() {
    super();

    // Abonelikler
    // orderbook -> marketId:outcome -> Set<ws>
    this.orderBookSubscribers = new Map();

    // trades -> marketId -> Set<ws>
    this.tradeSubscribers = new Map();

    // Her WebSocket için abonelik listesi (cleanup için)
    this.clientSubscriptions = new Map(); // ws -> Set<subscription>

    // İstatistikler
    this.stats = {
      totalMessages: 0,
      totalSubscribers: 0,
      orderBookUpdates: 0,
      tradeUpdates: 0
    };
  }

  /**
   * Order book'a abone ol
   */
  subscribeOrderBook(ws, marketId, outcome) {
    const key = `${marketId}:${outcome}`;

    if (!this.orderBookSubscribers.has(key)) {
      this.orderBookSubscribers.set(key, new Set());
    }

    this.orderBookSubscribers.get(key).add(ws);
    this._trackSubscription(ws, `orderbook:${key}`);

    console.log(`Order book aboneliği: ${key}`);
  }

  /**
   * Order book aboneliğini iptal et
   */
  unsubscribeOrderBook(ws, marketId, outcome) {
    const key = `${marketId}:${outcome}`;
    const subscribers = this.orderBookSubscribers.get(key);

    if (subscribers) {
      subscribers.delete(ws);
      this._untrackSubscription(ws, `orderbook:${key}`);

      if (subscribers.size === 0) {
        this.orderBookSubscribers.delete(key);
      }
    }
  }

  /**
   * Trade'lere abone ol
   */
  subscribeTrades(ws, marketId) {
    if (!this.tradeSubscribers.has(marketId)) {
      this.tradeSubscribers.set(marketId, new Set());
    }

    this.tradeSubscribers.get(marketId).add(ws);
    this._trackSubscription(ws, `trades:${marketId}`);

    console.log(`Trade aboneliği: ${marketId}`);
  }

  /**
   * Trade aboneliğini iptal et
   */
  unsubscribeTrades(ws, marketId) {
    const subscribers = this.tradeSubscribers.get(marketId);

    if (subscribers) {
      subscribers.delete(ws);
      this._untrackSubscription(ws, `trades:${marketId}`);

      if (subscribers.size === 0) {
        this.tradeSubscribers.delete(marketId);
      }
    }
  }

  /**
   * Tüm abonelikleri iptal et (disconnect)
   */
  unsubscribeAll(ws) {
    const subscriptions = this.clientSubscriptions.get(ws);

    if (subscriptions) {
      for (const sub of subscriptions) {
        const [type, key] = sub.split(':');

        if (type === 'orderbook') {
          const subscribers = this.orderBookSubscribers.get(key);
          if (subscribers) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
              this.orderBookSubscribers.delete(key);
            }
          }
        } else if (type === 'trades') {
          const subscribers = this.tradeSubscribers.get(key);
          if (subscribers) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
              this.tradeSubscribers.delete(key);
            }
          }
        }
      }

      this.clientSubscriptions.delete(ws);
    }
  }

  /**
   * Trade yayınla
   */
  publishTrade(trade) {
    const subscribers = this.tradeSubscribers.get(trade.marketId);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'trade',
      marketId: trade.marketId,
      data: {
        id: trade.id,
        outcome: trade.outcome,
        price: trade.price,
        quantity: trade.quantity,
        total: trade.total,
        timestamp: trade.timestamp
      }
    });

    this._broadcast(subscribers, message);
    this.stats.tradeUpdates++;
  }

  /**
   * Order book güncelleme yayınla
   */
  publishOrderBookUpdate(update) {
    const key = `${update.marketId}:${update.outcome}`;
    const subscribers = this.orderBookSubscribers.get(key);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'orderbook_update',
      marketId: update.marketId,
      outcome: update.outcome,
      updateType: update.type,
      data: update.type === 'TRADE' ? {
        price: update.trade.price,
        quantity: update.trade.quantity
      } : update.type === 'ADD' ? {
        price: update.order.price,
        quantity: update.order.quantity,
        side: update.order.type
      } : {
        orderId: update.orderId
      }
    });

    this._broadcast(subscribers, message);
    this.stats.orderBookUpdates++;
  }

  /**
   * Order book snapshot yayınla
   */
  publishOrderBookSnapshot(marketId, outcome, snapshot) {
    const key = `${marketId}:${outcome}`;
    const subscribers = this.orderBookSubscribers.get(key);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'orderbook_snapshot',
      marketId,
      outcome,
      data: snapshot
    });

    this._broadcast(subscribers, message);
  }

  /**
   * Tüm abonelere market durumu yayınla
   */
  publishMarketStatus(marketId, status) {
    // Order book abonelerine
    const yesKey = `${marketId}:true`;
    const noKey = `${marketId}:false`;

    const allSubscribers = new Set();

    const yesSubscribers = this.orderBookSubscribers.get(yesKey);
    const noSubscribers = this.orderBookSubscribers.get(noKey);
    const tradeSubscribers = this.tradeSubscribers.get(marketId);

    if (yesSubscribers) {
      yesSubscribers.forEach(ws => allSubscribers.add(ws));
    }
    if (noSubscribers) {
      noSubscribers.forEach(ws => allSubscribers.add(ws));
    }
    if (tradeSubscribers) {
      tradeSubscribers.forEach(ws => allSubscribers.add(ws));
    }

    if (allSubscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'market_status',
      marketId,
      data: status
    });

    this._broadcast(allSubscribers, message);
  }

  /**
   * Mesajı abonelere yayınla
   */
  _broadcast(subscribers, message) {
    const deadConnections = [];

    for (const ws of subscribers) {
      try {
        if (ws.readyState === 1) { // OPEN
          ws.send(message);
          this.stats.totalMessages++;
        } else {
          deadConnections.push(ws);
        }
      } catch (error) {
        console.error('Broadcast hatası:', error);
        deadConnections.push(ws);
      }
    }

    // Ölü bağlantıları temizle
    for (const ws of deadConnections) {
      this.unsubscribeAll(ws);
    }
  }

  /**
   * Aboneliği takip et
   */
  _trackSubscription(ws, subscription) {
    if (!this.clientSubscriptions.has(ws)) {
      this.clientSubscriptions.set(ws, new Set());
      this.stats.totalSubscribers++;
    }
    this.clientSubscriptions.get(ws).add(subscription);
  }

  /**
   * Abonelik takibini kaldır
   */
  _untrackSubscription(ws, subscription) {
    const subscriptions = this.clientSubscriptions.get(ws);
    if (subscriptions) {
      subscriptions.delete(subscription);
      if (subscriptions.size === 0) {
        this.clientSubscriptions.delete(ws);
        this.stats.totalSubscribers--;
      }
    }
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    return {
      ...this.stats,
      activeOrderBookChannels: this.orderBookSubscribers.size,
      activeTradeChannels: this.tradeSubscribers.size,
      activeClients: this.clientSubscriptions.size
    };
  }
}

module.exports = { MarketDataPublisher };
