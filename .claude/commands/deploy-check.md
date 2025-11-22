# Deploy Check Agent

Deployment öncesi kontrolleri yapar ve sorunları tespit eder.

## Kullanım
```
/deploy-check           # Tüm kontrolleri yap
/deploy-check --fix     # Sorunları otomatik düzelt
/deploy-check --push    # Kontrol + commit + push
```

## Argümanlar
$ARGUMENTS

## Görev

Kahin Backend deployment öncesi kontrol listesi:

### 1. Kod Kalitesi Kontrolleri
```bash
# Syntax hataları
node --check src/server.js

# Circular dependency kontrolü
# Import hatalarını tespit et
```

### 2. Migration Kontrolleri
- Yeni migration dosyaları var mı?
- Migration server.js'e eklenmiş mi?
- Migration idempotent mi?
- Model dosyası migration ile uyumlu mu?

### 3. Model-Route Uyumu
- Yeni model için route var mı?
- Route server.js'e mount edilmiş mi?
- Controller method'ları tanımlı mı?

### 4. Environment Kontrolleri
- .env dosyası kontrol et
- Gerekli environment variable'lar
- Production secrets kontrolü

### 5. Git Status
```bash
git status
git diff --stat
```

### 6. API Test
```bash
# Health check
curl https://api.kahinmarket.com/health

# Kritik endpoint'leri test et
```

### Checklist Çıktısı
```
✅ Syntax check passed
✅ No circular dependencies
✅ Migrations registered
✅ Routes mounted
⚠️  Warning: 2 uncommitted files
❌ Error: Missing migration in server.js

Öneriler:
1. server.js satır 23'e migration ekle
2. Uncommitted dosyaları commit et
```

### --push Flag
Tüm kontroller başarılı ise:
1. `git add .`
2. `git commit -m "feat/fix: [description]"`
3. `git push origin main`
4. Deploy sonrası health check
