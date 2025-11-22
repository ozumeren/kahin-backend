# Database Migration Agent

Güvenli ve idempotent database migration oluşturur.

## Kullanım
```
/migration users tablosuna phone_number kolonu ekle
/migration notifications tablosu oluştur
/migration orders tablosundaki status kolonunu enum yap
```

## Argümanlar
$ARGUMENTS

## Görev

Kahin Backend için database migration oluştur.

### Migration Pattern
```javascript
// migrations/[migration-name].js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Migration başlatılıyor...');

    // Tablo varlık kontrolü
    try {
      const tableDescription = await queryInterface.describeTable('table_name');

      // Kolon varlık kontrolü
      if (!tableDescription.column_name) {
        console.log('➕ column_name kolonu ekleniyor...');
        await queryInterface.addColumn('table_name', 'column_name', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
    } catch (error) {
      // Tablo yoksa oluştur
      if (error.message.includes('No description found')) {
        await queryInterface.createTable('table_name', {
          // columns...
        });
      }
    }

    console.log('✅ Migration tamamlandı!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    // Rollback işlemleri
  }
};
```

### Önemli Kurallar
1. **Idempotent olmalı** - Tekrar tekrar çalışabilmeli
2. **Existence check** - Tablo/kolon varsa atla
3. **Transaction kullan** - Büyük değişikliklerde
4. **Logging ekle** - Console.log ile progress göster
5. **down() yaz** - Rollback için

### Sonra Yapılacaklar
1. `src/server.js` içine migration'ı import et
2. startServer() içinde migration'ı çalıştır
3. İlgili model dosyasını güncelle
