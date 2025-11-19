/**
 * Sequencer - Emir Sıralayıcı
 *
 * Kritik bileşen: Tüm emirlerin adil sıralanmasını sağlar.
 * - FIFO (First In, First Out) kuyruk yapısı
 * - Tek iş parçacıklı (single-threaded) işleme
 * - Deterministik sequence numaraları
 * - Front-running koruması
 * - Batch processing desteği
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class Sequencer extends EventEmitter {
  constructor(config = {}) {
    super();

    this.matchingEngine = config.matchingEngine;
    this.persistence = config.persistence;
    this.riskEngine = config.riskEngine;

    // Sequence sayacı
    this.sequenceNumber = 0;

    // Emir kuyruğu (FIFO)
    this.orderQueue = [];

    // İşleme durumu
    this.isProcessing = false;
    this.isRunning = false;

    // Rate limiting
    this.maxOrdersPerSecond = config.maxOrdersPerSecond || 10000;
    this.orderCounts = new Map(); // timestamp -> count

    // Batch processing
    this.batchSize = config.batchSize || 100;
    this.batchTimeout = config.batchTimeout || 1; // ms

    // İstatistikler
    this.stats = {
      totalReceived: 0,
      totalProcessed: 0,
      totalRejected: 0,
      avgProcessingTime: 0
    };

    // Bekleyen emirler (orderId -> order)
    this.pendingOrders = new Map();

    // İşlem zamanlayıcısı
    this.processTimer = null;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Sequencer başlatıldı');

    // Sürekli işleme döngüsünü başlat
    this._startProcessingLoop();
  }

  async stop() {
    this.isRunning = false;

    // Zamanlayıcıyı durdur
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }

    // Kuyruktaki tüm emirleri işle
    while (this.orderQueue.length > 0) {
      await this._processBatch();
    }

    console.log('Sequencer durduruldu');
  }

  setSequenceNumber(number) {
    this.sequenceNumber = number;
  }

  /**
   * Yeni emir gönder
   */
  async submitOrder(order) {
    if (!this.isRunning) {
      throw new Error('Sequencer çalışmıyor');
    }

    // Rate limiting kontrolü
    if (!this._checkRateLimit(order.userId)) {
      const rejection = {
        orderId: order.id,
        reason: 'RATE_LIMIT_EXCEEDED',
        message: 'Çok fazla emir gönderildi, lütfen bekleyin'
      };
      this.emit('orderRejected', rejection);
      this.stats.totalRejected++;
      return { success: false, ...rejection };
    }

    // Emir validasyonu
    const validationResult = this._validateOrder(order);
    if (!validationResult.valid) {
      const rejection = {
        orderId: order.id,
        reason: 'VALIDATION_ERROR',
        message: validationResult.message
      };
      this.emit('orderRejected', rejection);
      this.stats.totalRejected++;
      return { success: false, ...rejection };
    }

    // Emri kuyruğa ekle
    const queuedOrder = {
      ...order,
      id: order.id || this._generateOrderId(),
      receivedAt: Date.now(),
      status: 'QUEUED'
    };

    this.orderQueue.push(queuedOrder);
    this.pendingOrders.set(queuedOrder.id, queuedOrder);
    this.stats.totalReceived++;

    // Persistence'a kaydet (WAL)
    if (this.persistence) {
      await this.persistence.logEvent({
        type: 'ORDER_RECEIVED',
        data: queuedOrder,
        timestamp: queuedOrder.receivedAt
      });
    }

    return {
      success: true,
      orderId: queuedOrder.id,
      position: this.orderQueue.length,
      estimatedProcessingTime: this._estimateProcessingTime()
    };
  }

  /**
   * Emir iptal et
   */
  async cancelOrder(orderId, userId) {
    if (!this.isRunning) {
      throw new Error('Sequencer çalışmıyor');
    }

    // Kuyrukta mı kontrol et
    const queueIndex = this.orderQueue.findIndex(o => o.id === orderId);
    if (queueIndex !== -1) {
      const order = this.orderQueue[queueIndex];

      // Yetki kontrolü
      if (order.userId !== userId) {
        return {
          success: false,
          reason: 'UNAUTHORIZED',
          message: 'Bu emri iptal etme yetkiniz yok'
        };
      }

      // Kuyruktan çıkar
      this.orderQueue.splice(queueIndex, 1);
      this.pendingOrders.delete(orderId);

      // İptal olayını kaydet
      const cancelEvent = {
        type: 'ORDER_CANCELLED',
        data: { orderId, userId, reason: 'USER_CANCELLED' },
        timestamp: Date.now()
      };

      if (this.persistence) {
        await this.persistence.logEvent(cancelEvent);
      }

      this.emit('orderCancelled', cancelEvent);

      return { success: true, message: 'Emir iptal edildi' };
    }

    // Matching Engine'de mi kontrol et
    const cancelResult = await this.matchingEngine.cancelOrder(orderId, userId);
    if (cancelResult.success) {
      // İptal olayını kaydet
      if (this.persistence) {
        await this.persistence.logEvent({
          type: 'ORDER_CANCELLED',
          data: { orderId, userId, reason: 'USER_CANCELLED' },
          timestamp: Date.now()
        });
      }
    }

    return cancelResult;
  }

  /**
   * İşleme döngüsünü başlat
   */
  _startProcessingLoop() {
    const processLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      if (this.orderQueue.length > 0 && !this.isProcessing) {
        await this._processBatch();
      }

      // Sonraki döngüyü zamanla
      this.processTimer = setTimeout(processLoop, this.batchTimeout);
    };

    processLoop();
  }

  /**
   * Batch işleme
   */
  async _processBatch() {
    if (this.isProcessing || this.orderQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Batch boyutu kadar emir al
      const batch = this.orderQueue.splice(0, this.batchSize);

      for (const order of batch) {
        await this._processOrder(order);
      }

      // İstatistikleri güncelle
      const processingTime = Date.now() - startTime;
      this._updateStats(batch.length, processingTime);
    } catch (error) {
      console.error('Batch işleme hatası:', error);
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Tek bir emri işle
   */
  async _processOrder(order) {
    const processStart = Date.now();

    try {
      // Sequence numarası ata
      this.sequenceNumber++;
      order.sequenceNumber = this.sequenceNumber;
      order.sequencedAt = Date.now();

      // Risk kontrolü
      const riskCheck = await this.riskEngine.checkOrder(order);
      if (!riskCheck.approved) {
        const rejection = {
          orderId: order.id,
          sequenceNumber: order.sequenceNumber,
          reason: riskCheck.reason,
          message: riskCheck.message
        };

        this.emit('orderRejected', rejection);
        this.stats.totalRejected++;
        this.pendingOrders.delete(order.id);

        // Rejection'ı kaydet
        if (this.persistence) {
          await this.persistence.logEvent({
            type: 'ORDER_REJECTED',
            data: rejection,
            timestamp: Date.now()
          });
        }

        return;
      }

      // Fonları/hisseleri kilitle
      await this.riskEngine.lockFunds(order);

      // Sequence olayını kaydet
      const sequenceEvent = {
        type: 'ORDER_SEQUENCED',
        data: order,
        timestamp: order.sequencedAt
      };

      if (this.persistence) {
        await this.persistence.logEvent(sequenceEvent);
      }

      this.emit('orderSequenced', {
        orderId: order.id,
        sequenceNumber: order.sequenceNumber,
        timestamp: order.sequencedAt
      });

      // Matching Engine'e gönder
      await this.matchingEngine.processOrder(order);

      this.stats.totalProcessed++;
      this.pendingOrders.delete(order.id);

      // İşlem süresini logla (performans izleme)
      const processTime = Date.now() - processStart;
      if (processTime > 10) {
        console.warn(`Yavaş emir işleme: ${order.id} - ${processTime}ms`);
      }
    } catch (error) {
      console.error(`Emir işleme hatası (${order.id}):`, error);

      // Kilitlenen fonları serbest bırak
      await this.riskEngine.unlockFunds(order);

      const rejection = {
        orderId: order.id,
        reason: 'PROCESSING_ERROR',
        message: error.message
      };

      this.emit('orderRejected', rejection);
      this.stats.totalRejected++;
      this.pendingOrders.delete(order.id);
    }
  }

  /**
   * Rate limiting kontrolü
   */
  _checkRateLimit(userId) {
    const now = Date.now();
    const second = Math.floor(now / 1000);
    const key = `${userId}:${second}`;

    const count = this.orderCounts.get(key) || 0;
    if (count >= this.maxOrdersPerSecond) {
      return false;
    }

    this.orderCounts.set(key, count + 1);

    // Eski kayıtları temizle
    if (this.orderCounts.size > 10000) {
      const threshold = second - 60;
      for (const [k] of this.orderCounts) {
        const ts = parseInt(k.split(':')[1]);
        if (ts < threshold) {
          this.orderCounts.delete(k);
        }
      }
    }

    return true;
  }

  /**
   * Emir validasyonu
   */
  _validateOrder(order) {
    if (!order.userId) {
      return { valid: false, message: 'Kullanıcı ID gerekli' };
    }

    if (!order.marketId) {
      return { valid: false, message: 'Market ID gerekli' };
    }

    if (!['BUY', 'SELL'].includes(order.type)) {
      return { valid: false, message: 'Geçersiz emir tipi (BUY/SELL)' };
    }

    if (typeof order.outcome !== 'boolean') {
      return { valid: false, message: 'Geçersiz outcome (true/false)' };
    }

    if (!order.quantity || order.quantity <= 0 || !Number.isInteger(order.quantity)) {
      return { valid: false, message: 'Geçersiz miktar (pozitif tam sayı olmalı)' };
    }

    if (!order.price || order.price < 0.01 || order.price > 0.99) {
      return { valid: false, message: 'Geçersiz fiyat (0.01 - 0.99 arası olmalı)' };
    }

    return { valid: true };
  }

  /**
   * Benzersiz emir ID oluştur
   */
  _generateOrderId() {
    return `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Tahmini işleme süresi
   */
  _estimateProcessingTime() {
    const queueLength = this.orderQueue.length;
    const avgTime = this.stats.avgProcessingTime || 1;
    return Math.ceil(queueLength * avgTime);
  }

  /**
   * İstatistikleri güncelle
   */
  _updateStats(batchSize, processingTime) {
    const avgTime = processingTime / batchSize;
    this.stats.avgProcessingTime =
      (this.stats.avgProcessingTime * 0.9) + (avgTime * 0.1);
  }

  /**
   * Saniyedeki emir sayısı
   */
  getOrdersPerSecond() {
    if (!this.isRunning) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const key = `total:${now}`;
    return this.orderCounts.get(key) || 0;
  }

  /**
   * Bekleyen emir sayısı
   */
  getPendingOrderCount() {
    return this.orderQueue.length;
  }

  /**
   * İstatistikleri getir
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.orderQueue.length,
      currentSequence: this.sequenceNumber
    };
  }
}

module.exports = { Sequencer };
