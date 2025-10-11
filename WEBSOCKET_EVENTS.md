# WebSocket Events Documentation

Bu dokümantasyon, Kahin Market uygulamasında kullanılan granüler WebSocket mesajlarını açıklar.

## Mesaj Tipleri

### 1. `orderbook_update` (Mevcut)

Emir defteri her güncellendiğinde tüm markete yayınlanır.

**Ne zaman gönderilir:**
- Yeni emir oluşturulduğunda
- Emir iptal edildiğinde
- Emirler eşleştiğinde

**Payload:**
```json
{
  "type": "orderbook_update",
  "marketId": 1,
  "data": {
    "marketId": 1,
    "marketTitle": "Bitcoin 100k olacak mı?",
    "marketStatus": "open",
    "yes": {
      "bids": [...],
      "asks": [...]
    },
    "no": {
      "bids": [...],
      "asks": [...]
    }
  },
  "timestamp": "2025-10-11T12:00:00.000Z"
}
```

**Frontend Kullanımı:**
```javascript
const { orderBook } = useMarketWebSocket(marketId, userId)
```

---

### 2. `new_trade` (YENİ ✨)

Bir işlem (trade) gerçekleştiğinde market'teki tüm kullanıcılara yayınlanır.

**Ne zaman gönderilir:**
- BUY emri SELL emriyle eşleştiğinde
- SELL emri BUY emriyle eşleştiğinde

**Payload:**
```json
{
  "type": "new_trade",
  "marketId": 1,
  "data": {
    "tradeId": 123,
    "buyerId": 5,
    "sellerId": 8,
    "outcome": true,
    "quantity": 10,
    "price": 0.65,
    "total": 6.50,
    "timestamp": "2025-10-11T12:00:00.000Z"
  },
  "timestamp": "2025-10-11T12:00:00.000Z"
}
```

**Frontend Kullanımı:**
```javascript
import { useNewTrades } from '../hooks/useWebSocket'

function LiveTradeFeed({ marketId }) {
  const [trades, setTrades] = useState([])
  
  useNewTrades(marketId, (trade) => {
    console.log('Yeni trade:', trade)
    setTrades(prev => [trade, ...prev].slice(0, 20))
  })
  
  return (
    <div>
      {trades.map(trade => (
        <div key={trade.tradeId}>
          {trade.quantity} @ {trade.price} TL
        </div>
      ))}
    </div>
  )
}
```

**Kullanım Alanları:**
- "Son İşlemler" listesi güncelleme
- Real-time trade feed
- Fiyat hareketi animasyonları
- İşlem hacmi göstergeleri

---

### 3. `my_order_filled` (YENİ ✨)

Sadece emri eşleşen kullanıcıya gönderilir (kişiselleştirilmiş).

**Ne zaman gönderilir:**
- Kullanıcının emrinin bir kısmı eşleştiğinde (partial fill)
- Kullanıcının emri tamamen eşleştiğinde (full fill)

**Payload:**
```json
{
  "type": "my_order_filled",
  "data": {
    "orderId": 456,
    "marketId": 1,
    "marketTitle": "Bitcoin 100k olacak mı?",
    "orderType": "BUY",
    "outcome": true,
    "originalQuantity": 20,
    "filledQuantity": 10,
    "remainingQuantity": 10,
    "price": 0.70,
    "avgFillPrice": 0.68,
    "status": "PARTIALLY_FILLED",
    "lastTradePrice": 0.68,
    "lastTradeQuantity": 10
  },
  "timestamp": "2025-10-11T12:00:00.000Z"
}
```

**Status Değerleri:**
- `PARTIALLY_FILLED`: Emrin bir kısmı eşleşti
- `FILLED`: Emir tamamen eşleşti

**Frontend Kullanımı:**
```javascript
import { useMyOrderEvents } from '../hooks/useWebSocket'
import { useToast } from '../context/ToastContext'

function OrderNotifications() {
  const { showToast } = useToast()
  
  useMyOrderEvents(
    // onOrderFilled callback
    (orderData) => {
      const status = orderData.status === 'FILLED' ? 'Tamamen' : 'Kısmen'
      showToast(
        `${status} eşleşti! ${orderData.filledQuantity} adet @ ${orderData.avgFillPrice} TL`,
        'success'
      )
    },
    // onOrderCancelled callback (aşağıda)
    null
  )
  
  return null
}
```

**Kullanım Alanları:**
- "Emriniz gerçekleşti!" bildirimleri
- Portfolio otomatik güncelleme
- Emir takip sayfası real-time güncelleme
- Ses/titreşim bildirimleri

---

### 4. `my_order_cancelled` (YENİ ✨)

Sadece emri iptal edilen kullanıcıya gönderilir (kişiselleştirilmiş).

**Ne zaman gönderilir:**
- Kullanıcı kendi emrini iptal ettiğinde
- Pazar kapandığında açık emirler iptal edildiğinde
- Pazar sonuçlandığında açık emirler iptal edildiğinde

**Payload:**
```json
{
  "type": "my_order_cancelled",
  "data": {
    "orderId": 789,
    "marketId": 1,
    "marketTitle": "Bitcoin 100k olacak mı?",
    "orderType": "SELL",
    "outcome": false,
    "quantity": 15,
    "price": 0.35,
    "reason": "market_resolved",
    "refundAmount": 5.25,
    "refundType": "balance"
  },
  "timestamp": "2025-10-11T12:00:00.000Z"
}
```

**Reason Değerleri:**
- `user_cancelled`: Kullanıcı manuel olarak iptal etti
- `market_closed`: Pazar kapandı
- `market_resolved`: Pazar sonuçlandı

**Refund Type Değerleri:**
- `balance`: Para iadesi (BUY emirleri için)
- `shares`: Hisse iadesi (SELL emirleri için)

**Frontend Kullanımı:**
```javascript
useMyOrderEvents(
  null, // onOrderFilled
  // onOrderCancelled callback
  (orderData) => {
    let reason = 'İptal edildi'
    
    if (orderData.reason === 'market_resolved') {
      reason = 'Pazar sonuçlandı'
    } else if (orderData.reason === 'market_closed') {
      reason = 'Pazar kapandı'
    }
    
    let refundMsg = ''
    if (orderData.refundType === 'balance') {
      refundMsg = ` ${orderData.refundAmount} TL iade edildi.`
    } else if (orderData.refundType === 'shares') {
      refundMsg = ` ${orderData.quantity} hisse iade edildi.`
    }
    
    showToast(`${reason}${refundMsg}`, 'info')
  }
)
```

**Kullanım Alanları:**
- İptal bildirimleri
- Bakiye/hisse iadesi bildirimleri
- Açık emir listesi otomatik güncelleme
- Pazar kapanış/sonuçlanma bildirimleri

---

## Backend Kullanımı

### WebSocket Server (config/websocket.js)

```javascript
const websocketServer = require('../../config/websocket')

// Yeni trade bildirimi gönder
await websocketServer.publishNewTrade(marketId, {
  tradeId: trade.id,
  buyerId: buyer.id,
  sellerId: seller.id,
  outcome: true,
  quantity: 10,
  price: 0.65,
  total: 6.50,
  timestamp: new Date().toISOString()
})

// Emir eşleşme bildirimi gönder (belirli kullanıcıya)
await websocketServer.publishOrderFilled(userId, {
  orderId: order.id,
  marketId: market.id,
  marketTitle: market.title,
  orderType: 'BUY',
  outcome: true,
  originalQuantity: 20,
  filledQuantity: 10,
  remainingQuantity: 10,
  price: 0.70,
  avgFillPrice: 0.68,
  status: 'PARTIALLY_FILLED',
  lastTradePrice: 0.68,
  lastTradeQuantity: 10
})

// Emir iptal bildirimi gönder (belirli kullanıcıya)
await websocketServer.publishOrderCancelled(userId, {
  orderId: order.id,
  marketId: order.marketId,
  marketTitle: market.title,
  orderType: 'SELL',
  outcome: false,
  quantity: 15,
  price: 0.35,
  reason: 'user_cancelled',
  refundAmount: 5.25,
  refundType: 'balance'
})
```

---

## Frontend Hooks

### `useWebSocket()`

Temel WebSocket bağlantısını yönetir.

```javascript
import { useWebSocket } from '../hooks/useWebSocket'

const {
  isConnected,
  subscribeToMarket,
  unsubscribeFromMarket,
  onMessage
} = useWebSocket()
```

### `useMarketWebSocket(marketId, userId)`

Belirli bir market'in emir defterini dinler.

```javascript
import { useMarketWebSocket } from '../hooks/useWebSocket'

const { isConnected, orderBook, lastUpdate } = useMarketWebSocket(marketId, userId)
```

### `useNewTrades(marketId, onNewTrade)`

Yeni trade'leri dinler.

```javascript
import { useNewTrades } from '../hooks/useWebSocket'

useNewTrades(marketId, (trade) => {
  console.log('Yeni trade:', trade)
})
```

### `useMyOrderEvents(onOrderFilled, onOrderCancelled)`

Kişisel emir olaylarını dinler.

```javascript
import { useMyOrderEvents } from '../hooks/useWebSocket'

useMyOrderEvents(
  (orderData) => console.log('Emir eşleşti:', orderData),
  (orderData) => console.log('Emir iptal edildi:', orderData)
)
```

---

## Örnek Kullanım Senaryoları

### 1. Real-Time Trade Feed

```javascript
function MarketDetailPage({ marketId }) {
  const [trades, setTrades] = useState([])
  
  useNewTrades(marketId, (trade) => {
    setTrades(prev => [trade, ...prev].slice(0, 50))
  })
  
  return (
    <div>
      <h2>Son İşlemler</h2>
      {trades.map(trade => (
        <TradeItem key={trade.tradeId} trade={trade} />
      ))}
    </div>
  )
}
```

### 2. Order Fill Notifications

```javascript
function App() {
  const { showToast } = useToast()
  
  useMyOrderEvents(
    (orderData) => {
      showToast(
        `✅ ${orderData.filledQuantity} adet eşleşti @ ${orderData.avgFillPrice} TL`,
        'success'
      )
    },
    null
  )
  
  return <Router>...</Router>
}
```

### 3. Comprehensive Notification System

```javascript
import WebSocketNotifications from './components/WebSocketNotifications'

function App() {
  return (
    <>
      <WebSocketNotifications />
      <Router>...</Router>
    </>
  )
}
```

---

## Güvenlik Notları

- `my_order_filled` ve `my_order_cancelled` mesajları sadece ilgili kullanıcıya gönderilir
- WebSocket subscription sırasında `userId` parametresi gönderilmelidir
- Backend, her client için `ws.userId` değerini tutar
- Sadece doğru `userId`'ye sahip clientlara kişisel mesajlar gönderilir

---

## Test Etme

### Backend'i başlat:
```bash
cd kahin-backend
npm start
```

### Frontend'i başlat:
```bash
cd kahin-frontend
npm run dev
```

### Test adımları:
1. İki farklı kullanıcıyla giriş yap (iki farklı browser)
2. Aynı market'te emirler oluştur
3. Emirler eşleştiğinde her iki kullanıcı da bildirim almalı
4. Bir emri iptal et - sadece o kullanıcı bildirim almalı
5. Pazarı sonuçlandır - açık emri olan herkes bildirim almalı

---

## Gelecek Geliştirmeler

Potansiyel ek mesaj tipleri:

- `market_status_changed`: Pazar durumu değiştiğinde
- `price_alert`: Fiyat belirli bir seviyeye ulaştığında
- `volume_spike`: İşlem hacmi artışında
- `user_mentioned`: Yorumlarda mention edildiğinde
- `leaderboard_update`: Liderlik tablosu güncellemelerinde

---

**Son Güncelleme:** 11 Ekim 2025
