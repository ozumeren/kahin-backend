# Test Generator Agent

Service ve controller'lar için Jest test dosyaları oluşturur.

## Kullanım
```
/test-gen order.service      # Order service için test
/test-gen auth.controller    # Auth controller için test
/test-gen market             # Market için tüm testler
```

## Argümanlar
$ARGUMENTS

## Görev

Kahin Backend için Jest test dosyaları oluştur.

### Test Pattern
```javascript
// tests/[feature].test.js
const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../src/middlewares/auth.middleware', () => (req, res, next) => {
  req.user = { id: 'test-user-id', role: 'user' };
  req.token = 'test-token';
  next();
});

// Mock service
jest.mock('../src/services/feature.service');

const featureRoutes = require('../src/routes/feature.route');
const featureService = require('../src/services/feature.service');

describe('Feature API', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/feature', featureRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/feature', () => {
    it('should return all items successfully', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      featureService.getAll.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/api/v1/feature')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockData);
    });

    it('should handle errors', async () => {
      featureService.getAll.mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/v1/feature');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/v1/feature', () => {
    it('should create item successfully', async () => {
      // Test implementation
    });

    it('should validate required fields', async () => {
      // Validation test
    });
  });
});
```

### Test Türleri
1. **Happy Path** - Başarılı senaryolar
2. **Error Cases** - Hata senaryoları (400, 401, 403, 404, 409)
3. **Validation** - Input validation testleri
4. **Edge Cases** - Sınır durumları
5. **Auth** - Yetkilendirme testleri

### Çıktı
- `tests/[feature].test.js` dosyası oluştur
- Mock data fixtures ekle
- Coverage report için öneriler yaz
