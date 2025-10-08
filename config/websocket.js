// config/websocket.js
const WebSocket = require('ws');
const { createClient } = require('redis');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.subscriberClient = null;
    this.clients = new Map(); // marketId -> Set of WebSocket clients
  }

  async initialize(server) {
    // WebSocket sunucusunu HTTP sunucusuna bağla
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });

    // Redis subscriber client oluştur (pub/sub için ayrı bağlantı gerekir)
    this.subscriberClient = createClient({
      url: process.env.REDIS_URL
    });

    this.subscriberClient.on('error', (err) => {
      console.error('Redis Subscriber Error:', err);
    });

    await this.subscriberClient.connect();
    console.log('✓ Redis Subscriber bağlantısı kuruldu.');

    // WebSocket bağlantılarını dinle
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 Yeni WebSocket bağlantısı:', req.socket.remoteAddress);

      // Bağlantı kurulduğunda hoş geldin mesajı
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket bağlantısı başarılı',
        timestamp: new Date().toISOString()
      }));

      // Subscribe mesajını dinle
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (error) {
          console.error('WebSocket mesaj hatası:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Geçersiz mesaj formatı',
            timestamp: new Date().toISOString()
          }));
        }
      });

      // Bağlantı koptuğunda temizlik
      ws.on('close', () => {
        this.removeClient(ws);
        console.log('🔌 WebSocket bağlantısı kapandı');
      });

      // Hata durumunda
      ws.on('error', (error) => {
        console.error('WebSocket hatası:', error);
        this.removeClient(ws);
      });

      // Ping-pong heartbeat (bağlantı canlılığı kontrolü)
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Her 30 saniyede bir ping gönder (bağlantı canlılığı kontrolü)
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.removeClient(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('✓ WebSocket sunucusu başlatıldı (path: /ws)');
  }

  async handleMessage(ws, data) {
    const { type, marketId } = data;

    switch (type) {
      case 'subscribe':
        await this.subscribeToMarket(ws, marketId);
        break;

      case 'unsubscribe':
        this.unsubscribeFromMarket(ws, marketId);
        break;

      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Bilinmeyen mesaj tipi',
          timestamp: new Date().toISOString()
        }));
    }
  }

  async subscribeToMarket(ws, marketId) {
    if (!marketId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'marketId gereklidir',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Client'ı bu market için kaydet
    if (!this.clients.has(marketId)) {
      this.clients.set(marketId, new Set());
      
      // Bu market için Redis channel'ına subscribe ol
      await this.subscriberClient.subscribe(
        `orderbook:${marketId}`,
        (message) => {
          this.broadcastToMarket(marketId, JSON.parse(message));
        }
      );
    }

    this.clients.get(marketId).add(ws);
    ws.subscribedMarkets = ws.subscribedMarkets || new Set();
    ws.subscribedMarkets.add(marketId);

    ws.send(JSON.stringify({
      type: 'subscribed',
      marketId,
      message: `${marketId} pazarına abone oldunuz`,
      timestamp: new Date().toISOString()
    }));

    console.log(`📊 Client ${marketId} pazarına abone oldu. Toplam: ${this.clients.get(marketId).size}`);
  }

  unsubscribeFromMarket(ws, marketId) {
    if (!marketId || !this.clients.has(marketId)) {
      return;
    }

    this.clients.get(marketId).delete(ws);
    if (ws.subscribedMarkets) {
      ws.subscribedMarkets.delete(marketId);
    }

    // Eğer bu markete abone kimse kalmadıysa Redis subscription'ı kapat
    if (this.clients.get(marketId).size === 0) {
      this.subscriberClient.unsubscribe(`orderbook:${marketId}`);
      this.clients.delete(marketId);
      console.log(`📊 ${marketId} pazarı için subscription kapatıldı`);
    }

    ws.send(JSON.stringify({
      type: 'unsubscribed',
      marketId,
      message: `${marketId} pazarından abonelik iptal edildi`,
      timestamp: new Date().toISOString()
    }));
  }

  removeClient(ws) {
    if (!ws.subscribedMarkets) return;

    // Client'ın abone olduğu tüm marketlerden çıkar
    ws.subscribedMarkets.forEach((marketId) => {
      this.unsubscribeFromMarket(ws, marketId);
    });
  }

  broadcastToMarket(marketId, data) {
    if (!this.clients.has(marketId)) return;

    const message = JSON.stringify({
      type: 'orderbook_update',
      marketId,
      data,
      timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    this.clients.get(marketId).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });

    console.log(`📡 ${marketId} için ${sentCount} client'a güncelleme gönderildi`);
  }

  // Order service tarafından çağrılacak (emir değiştiğinde)
  async publishOrderBookUpdate(marketId, orderBookData) {
    try {
      const redisClient = require('./redis');
      await redisClient.publish(
        `orderbook:${marketId}`,
        JSON.stringify(orderBookData)
      );
      
      console.log(`📡 Redis'e publish edildi: orderbook:${marketId}`);
    } catch (error) {
      console.error('Redis publish hatası:', error);
    }
  }
}

module.exports = new WebSocketServer();