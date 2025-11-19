/**
 * Persistence Manager - Event Sourcing ve Kalıcılık
 *
 * Motor bellek içinde çalışsa da emirlerin kaybolmamasını sağlar.
 * - Write-Ahead Log (WAL) ile event sourcing
 * - Periyodik snapshot'lar
 * - Crash recovery desteği
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class PersistenceManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.walPath = config.walPath || './data/wal';
    this.snapshotPath = config.snapshotPath || './data/snapshots';
    this.snapshotInterval = config.snapshotInterval || 10000;

    // WAL dosyası
    this.walFile = null;
    this.walFileName = null;

    // Event sayacı
    this.eventCount = 0;
    this.lastSnapshotEvent = 0;

    // Buffer (batch write için)
    this.writeBuffer = [];
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushInterval || 100; // ms

    // Flush timer
    this.flushTimer = null;

    // İstatistikler
    this.stats = {
      totalEvents: 0,
      totalSnapshots: 0,
      lastSnapshotTime: null,
      walSize: 0
    };
  }

  async initialize() {
    // Dizinleri oluştur
    await fs.mkdir(this.walPath, { recursive: true });
    await fs.mkdir(this.snapshotPath, { recursive: true });

    // Yeni WAL dosyası aç
    this.walFileName = `wal-${Date.now()}.log`;
    const walFilePath = path.join(this.walPath, this.walFileName);

    // Dosyayı oluştur ve aç
    await fs.writeFile(walFilePath, '');

    console.log(`WAL dosyası oluşturuldu: ${walFilePath}`);

    // Periyodik flush başlat
    this._startFlushTimer();

    this.emit('initialized');
  }

  /**
   * Event'i WAL'a kaydet
   */
  async logEvent(event) {
    const logEntry = {
      ...event,
      eventNumber: ++this.eventCount,
      timestamp: event.timestamp || Date.now()
    };

    // Buffer'a ekle
    this.writeBuffer.push(JSON.stringify(logEntry) + '\n');
    this.stats.totalEvents++;

    // Buffer doluysa flush et
    if (this.writeBuffer.length >= this.bufferSize) {
      await this._flushBuffer();
    }

    // Snapshot zamanı geldi mi?
    if (this.eventCount - this.lastSnapshotEvent >= this.snapshotInterval) {
      this.emit('snapshotNeeded', this.eventCount);
    }

    return logEntry.eventNumber;
  }

  /**
   * Snapshot kaydet
   */
  async saveSnapshot(state) {
    const snapshotData = {
      ...state,
      eventNumber: this.eventCount,
      timestamp: Date.now()
    };

    const fileName = `snapshot-${this.eventCount}-${Date.now()}.json`;
    const filePath = path.join(this.snapshotPath, fileName);

    await fs.writeFile(filePath, JSON.stringify(snapshotData, null, 2));

    this.lastSnapshotEvent = this.eventCount;
    this.stats.totalSnapshots++;
    this.stats.lastSnapshotTime = snapshotData.timestamp;

    console.log(`Snapshot kaydedildi: ${fileName}`);

    // Eski snapshot'ları temizle (son 5'i tut)
    await this._cleanOldSnapshots();

    this.emit('snapshotSaved', snapshotData);

    return fileName;
  }

  /**
   * En son durumu yükle (recovery)
   */
  async loadLatestState() {
    try {
      // En son snapshot'ı bul
      const snapshotFiles = await fs.readdir(this.snapshotPath);
      const snapshots = snapshotFiles
        .filter(f => f.startsWith('snapshot-'))
        .sort()
        .reverse();

      if (snapshots.length === 0) {
        console.log('Snapshot bulunamadı, sıfırdan başlanıyor');
        return null;
      }

      const latestSnapshot = snapshots[0];
      const snapshotPath = path.join(this.snapshotPath, latestSnapshot);
      const snapshotData = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

      console.log(`Snapshot yüklendi: ${latestSnapshot}`);

      // Snapshot'tan sonraki event'leri replay et
      const eventsToReplay = await this._getEventsAfter(snapshotData.eventNumber);

      if (eventsToReplay.length > 0) {
        console.log(`${eventsToReplay.length} event replay edilecek`);
        snapshotData.eventsToReplay = eventsToReplay;
      }

      // Event sayacını güncelle
      this.eventCount = snapshotData.eventNumber;
      this.lastSnapshotEvent = snapshotData.eventNumber;

      return snapshotData;
    } catch (error) {
      console.error('Durum yükleme hatası:', error);
      return null;
    }
  }

  /**
   * Belirli event numarasından sonraki event'leri al
   */
  async _getEventsAfter(eventNumber) {
    const events = [];

    try {
      const walFiles = await fs.readdir(this.walPath);
      const sortedFiles = walFiles.filter(f => f.endsWith('.log')).sort();

      for (const file of sortedFiles) {
        const filePath = path.join(this.walPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.eventNumber > eventNumber) {
              events.push(event);
            }
          } catch {
            // Bozuk satırı atla
          }
        }
      }
    } catch (error) {
      console.error('Event okuma hatası:', error);
    }

    return events;
  }

  /**
   * Buffer'ı diske yaz
   */
  async _flushBuffer() {
    if (this.writeBuffer.length === 0) {
      return;
    }

    const data = this.writeBuffer.join('');
    this.writeBuffer = [];

    const walFilePath = path.join(this.walPath, this.walFileName);

    try {
      await fs.appendFile(walFilePath, data);
      this.stats.walSize += data.length;
    } catch (error) {
      console.error('WAL yazma hatası:', error);
      // Buffer'ı geri koy
      this.writeBuffer = data.split('\n').filter(l => l);
      throw error;
    }
  }

  /**
   * Periyodik flush timer
   */
  _startFlushTimer() {
    this.flushTimer = setInterval(async () => {
      try {
        await this._flushBuffer();
      } catch (error) {
        console.error('Flush hatası:', error);
      }
    }, this.flushInterval);
  }

  /**
   * Eski snapshot'ları temizle
   */
  async _cleanOldSnapshots() {
    try {
      const files = await fs.readdir(this.snapshotPath);
      const snapshots = files
        .filter(f => f.startsWith('snapshot-'))
        .sort()
        .reverse();

      // Son 5'i tut, diğerlerini sil
      const toDelete = snapshots.slice(5);

      for (const file of toDelete) {
        await fs.unlink(path.join(this.snapshotPath, file));
        console.log(`Eski snapshot silindi: ${file}`);
      }
    } catch (error) {
      console.error('Snapshot temizleme hatası:', error);
    }
  }

  /**
   * Eski WAL dosyalarını temizle
   */
  async cleanOldWALFiles() {
    try {
      const files = await fs.readdir(this.walPath);
      const walFiles = files
        .filter(f => f.endsWith('.log') && f !== this.walFileName)
        .sort()
        .reverse();

      // Son 3'ü tut, diğerlerini sil
      const toDelete = walFiles.slice(3);

      for (const file of toDelete) {
        await fs.unlink(path.join(this.walPath, file));
        console.log(`Eski WAL silindi: ${file}`);
      }
    } catch (error) {
      console.error('WAL temizleme hatası:', error);
    }
  }

  /**
   * Tüm event'leri replay et (debug/test için)
   */
  async replayAllEvents(handler) {
    const walFiles = await fs.readdir(this.walPath);
    const sortedFiles = walFiles.filter(f => f.endsWith('.log')).sort();

    let totalReplayed = 0;

    for (const file of sortedFiles) {
      const filePath = path.join(this.walPath, file);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          await handler(event);
          totalReplayed++;
        } catch {
          // Bozuk satırı atla
        }
      }
    }

    console.log(`${totalReplayed} event replay edildi`);
    return totalReplayed;
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    return {
      ...this.stats,
      eventCount: this.eventCount,
      pendingWrites: this.writeBuffer.length
    };
  }

  /**
   * Kapat
   */
  async close() {
    // Timer'ı durdur
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Son verileri yaz
    await this._flushBuffer();

    console.log('Persistence Manager kapatıldı');
  }
}

module.exports = { PersistenceManager };
