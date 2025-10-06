# 1. Adım: Node.js'in kurulu olduğu bir başlangıç ortamı seç
FROM node:18-alpine

# --- YENİ EKLENEN KOD ---
# 'pg-native' gibi paketlerin derlenmesi için gerekli olan araçları kur.
RUN apk add --no-cache --virtual .gyp python3 make g++
# -------------------------

# 2. Adım: Uygulama dosyalarının yaşayacağı bir klasör oluştur
WORKDIR /app

# 3. Adım: package.json dosyasını kopyala ve bağımlılıkları kur
COPY package*.json ./
RUN npm install

# 4. Adım: Projenin geri kalan tüm dosyalarını kopyala
COPY . .

# 5. Adım: Uygulamanın çalışacağı portu belirt
EXPOSE 3000

# 6. Adım: Uygulamayı başlat
CMD [ "npm", "run", "start" ]