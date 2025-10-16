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
    const { type, marketId, userId } = data;

    switch (type) {
      case 'subscribe':
        await this.subscribeToMarket(ws, marketId, userId);
        break;

      case 'subscribe_user':
        this.subscribeUser(ws, userId);
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

  subscribeUser(ws, userId) {
    if (!userId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'userId gereklidir',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // UserId'yi WebSocket'e ekle (kişiselleştirilmiş bildirimler için)
    ws.userId = userId;

    ws.send(JSON.stringify({
      type: 'user_subscribed',
      userId,
      message: `User ${userId} abone oldu`,
      timestamp: new Date().toISOString()
    }));

    console.log(`👤 User ${userId} subscribed to personal notifications`);
  }

  async subscribeToMarket(ws, marketId, userId = null) {
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
    
    // UserId'yi WebSocket'e ekle (kişiselleştirilmiş bildirimler için)
    if (userId) {
      ws.userId = userId;
    }

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

  // Belirli bir kullanıcıya mesaj gönder
  sendToUser(userId, message) {
    let sentCount = 0;
    let totalClients = 0;
    let matchingUserClients = 0;
    
    // Tüm WebSocket client'larını kontrol et (wss.clients)
    this.wss.clients.forEach((client) => {
      totalClients++;
      
      // Client'a userId eklenmiş mi kontrol et
      if (client.userId === userId) {
        matchingUserClients++;
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            ...message,
            timestamp: new Date().toISOString()
          }));
          sentCount++;
        }
      }
    });
    
    console.log(`📊 sendToUser Debug - Target userId: ${userId}, Total clients: ${totalClients}, Matching user clients: ${matchingUserClients}, Sent: ${sentCount}`);
    
    return sentCount;
  }

  // Yeni işlem bildirimi (tüm marketteki kullanıcılara)
  async publishNewTrade(marketId, tradeData) {
    try {
      if (!this.clients.has(marketId)) return;

      const message = JSON.stringify({
        type: 'new_trade',
        marketId,
        data: {
          tradeId: tradeData.tradeId,
          buyerId: tradeData.buyerId,
          sellerId: tradeData.sellerId,
          outcome: tradeData.outcome,
          quantity: tradeData.quantity,
          price: tradeData.price,
          total: tradeData.total,
          timestamp: tradeData.timestamp
        },
        timestamp: new Date().toISOString()
      });

      let sentCount = 0;
      this.clients.get(marketId).forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
          sentCount++;
        }
      });

      console.log(`💹 ${marketId} için ${sentCount} client'a yeni trade bildirimi gönderildi`);
    } catch (error) {
      console.error('New trade publish hatası:', error);
    }
  }

  // Emir eşleşmesi bildirimi (sadece ilgili kullanıcıya)
  async publishOrderFilled(userId, orderData) {
    try {
      const message = {
        type: 'my_order_filled',
        data: {
          orderId: orderData.orderId,
          marketId: orderData.marketId,
          marketTitle: orderData.marketTitle,
          orderType: orderData.orderType,
          outcome: orderData.outcome,
          originalQuantity: orderData.originalQuantity,
          filledQuantity: orderData.filledQuantity,
          remainingQuantity: orderData.remainingQuantity,
          price: orderData.price,
          avgFillPrice: orderData.avgFillPrice,
          status: orderData.status, // 'PARTIALLY_FILLED' veya 'FILLED'
          lastTradePrice: orderData.lastTradePrice,
          lastTradeQuantity: orderData.lastTradeQuantity
        }
      };

      const sentCount = this.sendToUser(userId, message);
      
      if (sentCount === 0) {
        console.log(`⚠️ User ${userId} için aktif WebSocket bağlantısı bulunamadı`);
      }
    } catch (error) {
      console.error('Order filled publish hatası:', error);
    }
  }

  // Emir iptal bildirimi (sadece ilgili kullanıcıya)
  async publishOrderCancelled(userId, orderData) {
    try {
      const message = {
        type: 'my_order_cancelled',
        data: {
          orderId: orderData.orderId,
          marketId: orderData.marketId,
          marketTitle: orderData.marketTitle,
          orderType: orderData.orderType,
          outcome: orderData.outcome,
          quantity: orderData.quantity,
          price: orderData.price,
          reason: orderData.reason, // 'user_cancelled', 'market_closed', 'market_resolved'
          refundAmount: orderData.refundAmount,
          refundType: orderData.refundType // 'balance' veya 'shares'
        }
      };

      const sentCount = this.sendToUser(userId, message);
      
      if (sentCount === 0) {
        console.log(`⚠️ User ${userId} için aktif WebSocket bağlantısı bulunamadı`);
      }
    } catch (error) {
      console.error('Order cancelled publish hatası:', error);
    }
  }

  // Bakiye güncelleme bildirimi (sadece ilgili kullanıcıya)
  async publishBalanceUpdate(userId, newBalance) {
    try {
      const message = {
        type: 'balance_updated',
        data: {
          balance: newBalance
        }
      };

      const sentCount = this.sendToUser(userId, message);
      console.log(`💰 User ${userId} için bakiye güncellemesi gönderildi (${sentCount} client): ${newBalance}`);
    } catch (error) {
      console.error('Balance update publish hatası:', error);
    }
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