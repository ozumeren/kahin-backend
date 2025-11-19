/**
 * Risk Engine - Risk Yönetimi
 *
 * Emirleri kabul etmeden önce risk kontrolü yapar.
 * - Bakiye kontrolü
 * - Pozisyon/hisse kontrolü
 * - Marj gereksinimleri
 * - Kilitli fon yönetimi
 */

const { EventEmitter } = require('events');

class RiskEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.persistence = config.persistence;

    // Kullanıcı bakiyeleri (bellek içi)
    this.balances = new Map(); // userId -> { available, locked, total }

    // Kullanıcı pozisyonları (hisseler)
    this.positions = new Map(); // userId -> Map(marketId:outcome -> { available, locked })

    // Kilitli fonlar (orderId -> amount)
    this.lockedFunds = new Map();

    // Kilitli pozisyonlar (orderId -> { marketId, outcome, quantity })
    this.lockedPositions = new Map();

    // Risk limitleri
    this.limits = {
      maxOrderValue: config.maxOrderValue || 10000, // Maksimum emir değeri
      maxPositionSize: config.maxPositionSize || 100000, // Maksimum pozisyon büyüklüğü
      minBalance: config.minBalance || 0 // Minimum bakiye
    };

    // İstatistikler
    this.stats = {
      totalChecks: 0,
      approvedChecks: 0,
      rejectedChecks: 0
    };
  }

  async initialize() {
    console.log('Risk Engine başlatıldı');
    this.emit('initialized');
  }

  /**
   * Emir için risk kontrolü yap
   */
  async checkOrder(order) {
    this.stats.totalChecks++;

    const userId = order.userId;
    const orderValue = order.price * order.quantity;

    // Maksimum emir değeri kontrolü
    if (orderValue > this.limits.maxOrderValue) {
      this.stats.rejectedChecks++;
      return {
        approved: false,
        reason: 'MAX_ORDER_VALUE_EXCEEDED',
        message: `Maksimum emir değeri aşıldı (max: ${this.limits.maxOrderValue} TL)`
      };
    }

    if (order.type === 'BUY') {
      // Alış emri için bakiye kontrolü
      const balance = this.getBalance(userId);

      if (balance.available < orderValue) {
        this.stats.rejectedChecks++;
        return {
          approved: false,
          reason: 'INSUFFICIENT_BALANCE',
          message: `Yetersiz bakiye. Gereken: ${orderValue.toFixed(2)} TL, Mevcut: ${balance.available.toFixed(2)} TL`
        };
      }
    } else {
      // Satış emri için pozisyon kontrolü
      const position = this.getPosition(userId, order.marketId, order.outcome);

      if (position.available < order.quantity) {
        this.stats.rejectedChecks++;
        return {
          approved: false,
          reason: 'INSUFFICIENT_SHARES',
          message: `Yetersiz hisse. Gereken: ${order.quantity}, Mevcut: ${position.available}`
        };
      }
    }

    this.stats.approvedChecks++;
    return { approved: true };
  }

  /**
   * Fonları/hisseleri kilitle
   */
  async lockFunds(order) {
    const userId = order.userId;

    if (order.type === 'BUY') {
      const amount = order.price * order.quantity;
      const balance = this._getOrCreateBalance(userId);

      balance.available -= amount;
      balance.locked += amount;

      this.lockedFunds.set(order.id, { userId, amount });

      this.emit('balanceUpdated', {
        userId,
        type: 'LOCK',
        amount,
        balance: { ...balance }
      });
    } else {
      const position = this._getOrCreatePosition(userId, order.marketId, order.outcome);

      position.available -= order.quantity;
      position.locked += order.quantity;

      this.lockedPositions.set(order.id, {
        userId,
        marketId: order.marketId,
        outcome: order.outcome,
        quantity: order.quantity
      });

      this.emit('positionUpdated', {
        userId,
        marketId: order.marketId,
        outcome: order.outcome,
        type: 'LOCK',
        quantity: order.quantity,
        position: { ...position }
      });
    }
  }

  /**
   * Kilitli fonları/hisseleri serbest bırak
   */
  async unlockFunds(order) {
    const userId = order.userId;

    if (order.type === 'BUY') {
      const locked = this.lockedFunds.get(order.id);
      if (locked) {
        const balance = this._getOrCreateBalance(userId);

        balance.available += locked.amount;
        balance.locked -= locked.amount;

        this.lockedFunds.delete(order.id);

        this.emit('balanceUpdated', {
          userId,
          type: 'UNLOCK',
          amount: locked.amount,
          balance: { ...balance }
        });
      }
    } else {
      const locked = this.lockedPositions.get(order.id);
      if (locked) {
        const position = this._getOrCreatePosition(userId, order.marketId, order.outcome);

        position.available += locked.quantity;
        position.locked -= locked.quantity;

        this.lockedPositions.delete(order.id);

        this.emit('positionUpdated', {
          userId,
          marketId: order.marketId,
          outcome: order.outcome,
          type: 'UNLOCK',
          quantity: locked.quantity,
          position: { ...position }
        });
      }
    }
  }

  /**
   * Trade sonrası bakiye/pozisyon güncelle
   */
  async settleTrade(trade) {
    const { buyerId, sellerId, quantity, price, total, marketId, outcome } = trade;

    // Alıcı işlemleri
    const buyerBalance = this._getOrCreateBalance(buyerId);

    // Kilitli fonlardan düş
    const buyerLocked = this.lockedFunds.get(trade.buyOrderId);
    if (buyerLocked) {
      buyerBalance.locked -= total;
      buyerBalance.total -= total;

      // Fiyat farkı varsa iade et
      const refund = buyerLocked.amount - total;
      if (refund > 0) {
        buyerBalance.available += refund;
      }

      this.lockedFunds.set(trade.buyOrderId, {
        ...buyerLocked,
        amount: buyerLocked.amount - total - refund
      });
    }

    // Alıcıya hisse ekle
    const buyerPosition = this._getOrCreatePosition(buyerId, marketId, outcome);
    buyerPosition.available += quantity;

    // Satıcı işlemleri
    const sellerBalance = this._getOrCreateBalance(sellerId);

    // Satıcıya para ekle
    sellerBalance.available += total;
    sellerBalance.total += total;

    // Kilitli hisselerden düş
    const sellerLocked = this.lockedPositions.get(trade.sellOrderId);
    if (sellerLocked) {
      const sellerPosition = this._getOrCreatePosition(sellerId, marketId, outcome);
      sellerPosition.locked -= quantity;

      this.lockedPositions.set(trade.sellOrderId, {
        ...sellerLocked,
        quantity: sellerLocked.quantity - quantity
      });
    }

    // Event'leri emit et
    this.emit('balanceUpdated', {
      userId: buyerId,
      type: 'TRADE_BUY',
      amount: -total,
      balance: { ...buyerBalance }
    });

    this.emit('balanceUpdated', {
      userId: sellerId,
      type: 'TRADE_SELL',
      amount: total,
      balance: { ...sellerBalance }
    });

    this.emit('positionUpdated', {
      userId: buyerId,
      marketId,
      outcome,
      type: 'TRADE_BUY',
      quantity
    });

    this.emit('positionUpdated', {
      userId: sellerId,
      marketId,
      outcome,
      type: 'TRADE_SELL',
      quantity: -quantity
    });
  }

  /**
   * Bakiye al
   */
  getBalance(userId) {
    const balance = this.balances.get(userId);
    return balance || { available: 0, locked: 0, total: 0 };
  }

  /**
   * Tüm bakiyeleri al
   */
  getBalances() {
    const result = {};
    for (const [userId, balance] of this.balances) {
      result[userId] = { ...balance };
    }
    return result;
  }

  /**
   * Pozisyon al
   */
  getPosition(userId, marketId, outcome) {
    const key = `${marketId}:${outcome}`;
    const userPositions = this.positions.get(userId);

    if (!userPositions) {
      return { available: 0, locked: 0 };
    }

    return userPositions.get(key) || { available: 0, locked: 0 };
  }

  /**
   * Kullanıcının tüm pozisyonlarını al
   */
  getPositions(userId) {
    const userPositions = this.positions.get(userId);

    if (!userPositions) {
      return {};
    }

    const result = {};
    for (const [key, position] of userPositions) {
      result[key] = { ...position };
    }
    return result;
  }

  /**
   * Bakiye ayarla (deposit, withdraw)
   */
  setBalance(userId, amount) {
    const balance = this._getOrCreateBalance(userId);
    const diff = amount - balance.total;

    balance.available += diff;
    balance.total = amount;

    this.emit('balanceUpdated', {
      userId,
      type: 'SET',
      amount: diff,
      balance: { ...balance }
    });
  }

  /**
   * Bakiye ekle
   */
  addBalance(userId, amount) {
    const balance = this._getOrCreateBalance(userId);

    balance.available += amount;
    balance.total += amount;

    this.emit('balanceUpdated', {
      userId,
      type: 'ADD',
      amount,
      balance: { ...balance }
    });
  }

  /**
   * Pozisyon ayarla
   */
  setPosition(userId, marketId, outcome, quantity) {
    const position = this._getOrCreatePosition(userId, marketId, outcome);
    const diff = quantity - (position.available + position.locked);

    position.available += diff;

    this.emit('positionUpdated', {
      userId,
      marketId,
      outcome,
      type: 'SET',
      quantity: diff
    });
  }

  /**
   * Bakiyeleri geri yükle (recovery)
   */
  async restoreBalances(savedBalances) {
    for (const [userId, balance] of Object.entries(savedBalances)) {
      this.balances.set(userId, { ...balance });
    }
    console.log(`${this.balances.size} bakiye yüklendi`);
  }

  /**
   * Pozisyonları geri yükle (recovery)
   */
  async restorePositions(savedPositions) {
    for (const [userId, positions] of Object.entries(savedPositions)) {
      const userPositions = new Map();
      for (const [key, position] of Object.entries(positions)) {
        userPositions.set(key, { ...position });
      }
      this.positions.set(userId, userPositions);
    }
    console.log(`${this.positions.size} kullanıcı pozisyonu yüklendi`);
  }

  /**
   * Bakiye al veya oluştur
   */
  _getOrCreateBalance(userId) {
    if (!this.balances.has(userId)) {
      this.balances.set(userId, { available: 0, locked: 0, total: 0 });
    }
    return this.balances.get(userId);
  }

  /**
   * Pozisyon al veya oluştur
   */
  _getOrCreatePosition(userId, marketId, outcome) {
    if (!this.positions.has(userId)) {
      this.positions.set(userId, new Map());
    }

    const userPositions = this.positions.get(userId);
    const key = `${marketId}:${outcome}`;

    if (!userPositions.has(key)) {
      userPositions.set(key, { available: 0, locked: 0 });
    }

    return userPositions.get(key);
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    return {
      ...this.stats,
      totalUsers: this.balances.size,
      totalLockedOrders: this.lockedFunds.size + this.lockedPositions.size
    };
  }
}

module.exports = { RiskEngine };
