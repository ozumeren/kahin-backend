---
description: Yeni feature için model, service, controller, route ve migration oluşturur
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# New Feature Scaffold Agent

Yeni bir özellik için tüm gerekli dosyaları oluşturur.

## Argümanlar
$ARGUMENTS

## Görev

Kahin Backend projesi için yeni bir feature oluştur. Aşağıdaki dosyaları MUTLAKA oluştur:

### 1. Model Dosyası (`src/models/[feature].model.js`)
```javascript
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const FeatureName = sequelize.define('FeatureName', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Feature specific fields...
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'feature_names',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = FeatureName;
```

### 2. Service Dosyası (`src/services/[feature].service.js`)
- Class-based service
- Async CRUD methods
- sequelize.transaction() kullan
- ApiError class ile hata fırlat

### 3. Controller Dosyası (`src/controllers/[feature].controller.js`)
- Class-based controller
- try-catch pattern
- next(error) ile hata yönetimi
- Response format: { success: true, data/message }

### 4. Route Dosyası (`src/routes/[feature].route.js`)
- Express Router kullan
- authMiddleware import et
- RESTful endpoint'ler

### 5. Migration Dosyası (`migrations/add-[feature].js`)
- Idempotent migration (tekrar çalışabilir)
- Table/column existence check
- up() ve down() fonksiyonları

### 6. Güncellemeler
- `src/models/index.js` - Model import ve relationship ekle
- `src/server.js` - Route mount et, migration ekle

## Proje Standartları
- UUID primary key
- snake_case tablo/kolon isimleri
- Türkçe hata mesajları
- WebSocket broadcast gerekiyorsa ekle
