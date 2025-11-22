# API Documentation Agent

API endpoint'lerini analiz edip dokümantasyon oluşturur/günceller.

## Kullanım
```
/api-doc              # Tüm endpoint'leri dokümante et
/api-doc auth         # Sadece auth endpoint'lerini
/api-doc --update     # API_DOCUMENTATION.md güncelle
```

## Argümanlar
$ARGUMENTS

## Görev

### 1. Route Dosyalarını Tara
`src/routes/*.route.js` dosyalarını oku ve endpoint'leri çıkar:
- HTTP method (GET, POST, PUT, DELETE, PATCH)
- Path (/api/v1/...)
- Middleware (auth, rateLimit, cache)
- Controller method

### 2. Controller'ları Analiz Et
`src/controllers/*.controller.js` dosyalarından:
- Request body parametreleri
- Query parametreleri
- Response format
- Olası hatalar (ApiError kullanımları)

### 3. Dokümantasyon Formatı
```markdown
## [Resource Name]

### [METHOD] /api/v1/path
**Açıklama:** Endpoint açıklaması

**Auth:** Gerekli / Gerekli Değil

**Request Body:**
| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|

**Response:**
```json
{
  "success": true,
  "data": {}
}
```

**Hatalar:**
- 400: Geçersiz istek
- 401: Yetkilendirme hatası
- 404: Bulunamadı
```

### 4. Çıktı
- Console'a özet yaz
- API_DOCUMENTATION.md dosyasını güncelle
- Eksik dokümantasyonları listele
