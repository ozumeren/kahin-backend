# Kahin Market API Dokümantasyonu

Bu dokümantasyon, Kahin Market API'sinin tüm endpoint'lerini Türkçe açıklamalarıyla içermektedir.

**Base URL:** `https://api.kahinmarket.com/api/v1`

**Yetkilendirme:** Korumalı endpoint'ler için `Authorization: Bearer <token>` header'ı gereklidir.

---

## İçindekiler

1. [Kimlik Doğrulama (Auth)](#1-kimlik-doğrulama-auth)
2. [Kullanıcılar (Users)](#2-kullanıcılar-users)
3. [Pazarlar (Markets)](#3-pazarlar-markets)
4. [Emirler (Orders)](#4-emirler-orders)
5. [İşlemler (Trades)](#5-i̇şlemler-trades)
6. [Portföy (Portfolio)](#6-portföy-portfolio)
7. [Cüzdan (Wallet)](#7-cüzdan-wallet)
8. [Hisseler (Shares)](#8-hisseler-shares)
9. [Transferler (Transactions)](#9-transferler-transactions)
10. [Opsiyonlar (Options)](#10-opsiyonlar-options)
11. [Kontratlar (Contracts)](#11-kontratlar-contracts)
12. [Admin Paneli](#12-admin-paneli)

---

## 1. Kimlik Doğrulama (Auth)

Kullanıcı girişi ve kayıt işlemleri için kullanılan endpoint'ler.

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/auth/register` | Yeni kullanıcı kaydı oluşturur. Email, şifre ve kullanıcı adı gereklidir. |
| POST | `/auth/login` | Kullanıcı girişi yapar. Başarılı girişte JWT token döner. |

### Örnek İstekler

**Kayıt:**
```json
POST /auth/register
{
  "email": "kullanici@email.com",
  "password": "Sifre123",
  "username": "kullaniciadi"
}
```

**Giriş:**
```json
POST /auth/login
{
  "email": "kullanici@email.com",
  "password": "Sifre123"
}
```

---

## 2. Kullanıcılar (Users)

Kullanıcı profili ve istatistikleri için endpoint'ler.

| Metod | Endpoint | Yetki | Açıklama |
|-------|----------|-------|----------|
| GET | `/users/me` | Auth | Giriş yapmış kullanıcının profil bilgilerini getirir. |
| PUT | `/users/me` | Auth | Kullanıcı profilini günceller (avatar, bio vb.). |
| GET | `/users/me/stats` | Auth | Kullanıcının istatistiklerini getirir (işlem sayısı, kazanç vb.). |
| GET | `/users/leaderboard` | Public | Liderlik tablosunu getirir. |
| GET | `/users/:id/public` | Public | Belirtilen kullanıcının herkese açık profilini getirir. |

### Query Parametreleri

**Leaderboard:**
- `limit`: Kaç kullanıcı getirileceği (varsayılan: 20)
- `timeframe`: Zaman aralığı (`all`, `week`, `month`)

---

## 3. Pazarlar (Markets)

Tahmin pazarları için tüm endpoint'ler. Tüm market endpoint'leri herkese açıktır.

### Keşif ve Filtreleme

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/markets` | Tüm pazarları listeler. |
| GET | `/markets/featured` | Öne çıkan pazarları getirir. |
| GET | `/markets/trending` | Trend olan pazarları getirir. |
| GET | `/markets/search` | Pazarlarda arama yapar. |
| GET | `/markets/categories` | Tüm kategorileri ve istatistiklerini getirir. |
| GET | `/markets/category/:category` | Belirli kategorideki pazarları getirir. |

### Pazar Detayları

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/markets/:id` | Tek bir pazarın detaylarını getirir. |
| GET | `/markets/:id/orderbook` | Pazarın emir defterini getirir (alış/satış emirleri). |
| GET | `/markets/:id/similar` | Benzer pazarları önerir. |

### Fiyat Geçmişi ve İstatistikler

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/markets/:id/candles` | OHLCV mum grafiği verisini getirir. |
| GET | `/markets/:id/candles/latest` | En son mum verisini getirir. |
| GET | `/markets/:id/stats/24h` | Son 24 saatlik istatistikleri getirir. |
| GET | `/markets/:id/price` | Güncel fiyatı getirir. |

### Query Parametreleri

**Candles:**
- `outcome`: `true` (Evet) veya `false` (Hayır)
- `interval`: `1m`, `5m`, `15m`, `1h`, `1d`
- `startTime`: Başlangıç zamanı (ISO 8601)
- `endTime`: Bitiş zamanı (ISO 8601)
- `limit`: Maksimum kayıt sayısı (varsayılan: 100)

---

## 4. Emirler (Orders)

Alım-satım emirleri için endpoint'ler. Tüm emir endpoint'leri yetkilendirme gerektirir.

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/orders` | Yeni emir oluşturur. |
| GET | `/orders` | Kullanıcının emirlerini listeler. |
| GET | `/orders/conditional` | Koşullu emirleri listeler (stop-loss, take-profit). |
| POST | `/orders/batch` | Birden fazla emir oluşturur. |
| DELETE | `/orders/batch` | Birden fazla emri iptal eder. |
| GET | `/orders/:id` | Tek bir emrin detaylarını getirir. |
| PATCH | `/orders/:id` | Emri günceller (fiyat/miktar değişikliği). |
| DELETE | `/orders/:id` | Emri iptal eder. |

### Emir Tipleri

| Tip | Açıklama |
|-----|----------|
| `LIMIT` | Belirlenen fiyattan alım/satım emri |
| `MARKET` | Piyasa fiyatından anlık alım/satım |
| `STOP_LOSS` | Zarar durdurma emri - Fiyat düştüğünde tetiklenir |
| `TAKE_PROFIT` | Kar alma emri - Fiyat yükseldiğinde tetiklenir |
| `STOP_LIMIT` | Stop-limit emri - Tetikleme fiyatı ve limit fiyatı içerir |

### Geçerlilik Süreleri (Time in Force)

| Tip | Açıklama |
|-----|----------|
| `GTC` | Good-Til-Cancelled - İptal edilene kadar geçerli |
| `GTD` | Good-Til-Date - Belirli tarihe kadar geçerli |
| `IOC` | Immediate-Or-Cancel - Anında gerçekleş veya iptal et |
| `FOK` | Fill-Or-Kill - Tamamını gerçekleştir veya iptal et |

### Örnek İstek

```json
POST /orders
{
  "marketId": "uuid-market-id",
  "type": "BUY",
  "outcome": true,
  "price": 0.65,
  "quantity": 100,
  "order_type": "LIMIT",
  "time_in_force": "GTC"
}
```

**Stop-Loss Emri:**
```json
POST /orders
{
  "marketId": "uuid-market-id",
  "type": "SELL",
  "outcome": true,
  "quantity": 50,
  "order_type": "STOP_LOSS",
  "trigger_price": 0.40
}
```

---

## 5. İşlemler (Trades)

Gerçekleşen alım-satım işlemleri için endpoint'ler.

| Metod | Endpoint | Yetki | Açıklama |
|-------|----------|-------|----------|
| GET | `/trades/recent` | Public | Son işlemleri getirir. |
| GET | `/trades/market/:marketId` | Public | Belirli pazardaki işlemleri getirir. |
| GET | `/trades/:id` | Public | Tek bir işlemin detaylarını getirir. |
| GET | `/trades/my/all` | Auth | Kullanıcının tüm işlemlerini getirir. |
| GET | `/trades/my/summary` | Auth | Kullanıcının işlem özetini getirir. |
| GET | `/trades/my/market/:marketId` | Auth | Kullanıcının belirli pazardaki işlemlerini getirir. |

---

## 6. Portföy (Portfolio)

Kullanıcının yatırım portföyü için endpoint'ler. Tüm endpoint'ler yetkilendirme gerektirir.

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/portfolio` | Kullanıcının tüm portföyünü getirir (hisseler, değer, P&L). |
| GET | `/portfolio/realized` | Gerçekleşmiş kar/zarar bilgisini getirir. |
| GET | `/portfolio/performance` | Portföy performans istatistiklerini getirir. |
| GET | `/portfolio/market/:marketId` | Belirli pazardaki pozisyonu getirir. |

---

## 7. Cüzdan (Wallet)

Kullanıcının bakiye ve para işlemleri için endpoint'ler. Tüm endpoint'ler yetkilendirme gerektirir.

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/wallet/balance` | Bakiye ve istatistikleri getirir. |
| GET | `/wallet/limits` | Günlük işlem limitlerini getirir. |
| GET | `/wallet/locked-funds` | Kilitli bakiyeyi getirir (açık emirlerdeki tutar). |
| GET | `/wallet/history` | Cüzdan işlem geçmişini getirir. |
| POST | `/wallet/deposit` | Para yatırma işlemi yapar (test/demo). |
| POST | `/wallet/withdraw` | Para çekme işlemi yapar. |

### Query Parametreleri (History)

- `type`: İşlem tipi filtresi
- `startDate`: Başlangıç tarihi
- `endDate`: Bitiş tarihi
- `limit`: Sayfa başına kayıt
- `offset`: Atlama sayısı
- `marketId`: Pazar filtresi

---

## 8. Hisseler (Shares)

Hisse alım işlemleri için endpoint. Yetkilendirme gerektirir.

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/shares/buy` | Hisse satın alır. |

---

## 9. Transferler (Transactions)

Para transferi ve işlem kayıtları için endpoint'ler.

| Metod | Endpoint | Yetki | Açıklama |
|-------|----------|-------|----------|
| GET | `/transactions/my` | Auth | Kullanıcının transferlerini getirir. |
| GET | `/transactions/my/summary` | Auth | Kullanıcının transfer özetini getirir. |
| GET | `/transactions/my/market/:marketId` | Auth | Belirli pazardaki transferleri getirir. |
| GET | `/transactions/system/stats` | Admin | Sistem istatistiklerini getirir. |

---

## 10. Opsiyonlar (Options)

Çoklu seçenekli pazarlar için endpoint'ler.

| Metod | Endpoint | Yetki | Açıklama |
|-------|----------|-------|----------|
| POST | `/options/:optionId/trade` | Auth | Opsiyon alım/satımı yapar. |
| GET | `/options/market/:marketId/positions` | Auth | Pazardaki opsiyon pozisyonlarını getirir. |
| GET | `/options/:optionId/positions` | Public | Opsiyondaki tüm pozisyonları getirir. |

---

## 11. Kontratlar (Contracts)

Pazar kontratları yönetimi için endpoint'ler.

### Herkese Açık

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/contracts/:code/preview` | Kontrat önizlemesini getirir. |

### Admin Gerektiren

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/contracts/templates` | Kontrat şablonlarını getirir. |
| POST | `/contracts` | Yeni kontrat oluşturur. |
| GET | `/contracts` | Tüm kontratları listeler. |
| GET | `/contracts/:id` | Kontrat detaylarını getirir. |
| GET | `/contracts/code/:code` | Koda göre kontrat getirir. |
| PATCH | `/contracts/:id` | Kontratı günceller. |
| DELETE | `/contracts/:id` | Kontratı siler (sadece taslaklar). |
| POST | `/contracts/:id/submit-review` | Kontratı incelemeye gönderir. |
| POST | `/contracts/:id/review` | Kontratı inceler. |
| POST | `/contracts/:id/approve` | Kontratı onaylar. |
| POST | `/contracts/:id/publish` | Kontratı yayınlar. |
| POST | `/contracts/:id/evidence` | Sonuçlandırma kanıtı ekler. |
| POST | `/contracts/evidence/:evidenceId/verify` | Kanıtı doğrular. |
| POST | `/contracts/:id/resolve` | Kontratı sonuçlandırır. |

---

## 12. Admin Paneli

Yönetici işlemleri için endpoint'ler. Tüm endpoint'ler admin yetkisi gerektirir.

### Dashboard ve Aktivite

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/dashboard` | Platform istatistiklerini getirir (kullanıcılar, pazarlar, emirler, hacim). |
| GET | `/admin/activity` | Son platform aktivitelerini getirir. |

### Analitik

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/analytics/users` | Kullanıcı büyüme grafiği verisi. |
| GET | `/admin/analytics/volume` | Hacim ve işlem grafiği verisi. |
| GET | `/admin/analytics/markets` | Pazar istatistikleri (kategori, durum, en iyiler). |

**Query Parametreleri:**
- `days`: Kaç günlük veri (varsayılan: 30)

### Pazar Yönetimi

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/markets` | Tüm pazarları listeler. |
| POST | `/admin/markets` | Yeni pazar oluşturur. |
| PUT | `/admin/markets/:id` | Pazarı günceller. |
| DELETE | `/admin/markets/:id` | Pazarı siler. |
| POST | `/admin/markets/:id/resolve` | Pazarı sonuçlandırır (evet/hayır). |
| POST | `/admin/markets/:id/close` | Pazarı kapatır (yeni emir alınmaz). |
| POST | `/admin/markets/:id/backfill-prices` | Fiyat geçmişini doldurur. |

### Kullanıcı Yönetimi

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/users` | Tüm kullanıcıları listeler. |
| GET | `/admin/users/:id` | Kullanıcı detaylarını getirir (hisseler, emirler, işlemler). |
| GET | `/admin/users/:id/activity` | Kullanıcının aktivite geçmişini getirir. |
| PATCH | `/admin/users/:id/promote` | Kullanıcıyı admin yapar. |
| PATCH | `/admin/users/:id/demote` | Kullanıcının admin yetkisini kaldırır. |
| PATCH | `/admin/users/:id/ban` | Kullanıcıyı banlar (açık emirleri iptal edilir). |
| PATCH | `/admin/users/:id/unban` | Kullanıcının banını kaldırır. |
| POST | `/admin/users/:id/add-balance` | Kullanıcıya bakiye ekler. |
| POST | `/admin/users/:id/add-shares` | Kullanıcıya hisse ekler. |

### Kontrat Yönetimi

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/contracts` | Tüm kontratları listeler. |
| GET | `/admin/contracts/:id` | Kontrat detaylarını getirir. |
| PATCH | `/admin/contracts/:id/approve` | Kontratı onaylar. |
| PATCH | `/admin/contracts/:id/reject` | Kontratı reddeder. |
| PATCH | `/admin/contracts/:id/publish` | Kontratı yayınlar. |

### Emir Yönetimi

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/admin/orders` | Tüm emirleri listeler (filtrelenebilir). |
| DELETE | `/admin/orders/:id` | Herhangi bir emri iptal eder (iade yapılır). |

**Query Parametreleri (Orders):**
- `status`: Emir durumu (`OPEN`, `FILLED`, `CANCELLED`)
- `marketId`: Pazar filtresi
- `userId`: Kullanıcı filtresi
- `order_type`: Emir tipi filtresi
- `limit`: Sayfa başına kayıt
- `offset`: Atlama sayısı

---

## Hata Kodları

| Kod | Açıklama |
|-----|----------|
| 200 | Başarılı |
| 201 | Oluşturuldu |
| 400 | Geçersiz istek |
| 401 | Yetkilendirme gerekli |
| 403 | Erişim reddedildi |
| 404 | Bulunamadı |
| 500 | Sunucu hatası |

---

## Yanıt Formatı

Tüm API yanıtları aşağıdaki formatta döner:

**Başarılı:**
```json
{
  "success": true,
  "data": { ... },
  "message": "İşlem başarılı"
}
```

**Hata:**
```json
{
  "success": false,
  "message": "Hata açıklaması",
  "statusCode": 400
}
```

---

## WebSocket

Gerçek zamanlı veri için WebSocket bağlantısı:

**URL:** `wss://api.kahinmarket.com/ws`

### Olaylar

- `orderbook_update`: Emir defteri güncellemesi
- `trade`: Yeni işlem
- `price_update`: Fiyat güncellemesi

---

*Son güncelleme: Kasım 2025*
