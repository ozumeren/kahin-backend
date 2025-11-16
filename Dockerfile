# Multi-stage build için base image
FROM node:18-alpine AS base

# Dependencies için stage
FROM base AS deps
WORKDIR /app

# package.json ve package-lock.json'ı kopyala
COPY package*.json ./

# Clean install - cache sorunlarını önlemek için
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Builder stage
FROM base AS builder
WORKDIR /app

# Dependencies'i deps stage'den kopyala
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production image
FROM base AS runner
WORKDIR /app

# Production için gerekli system packages (eğer varsa)
RUN apk add --no-cache bash

# User oluştur
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Dependencies ve app files'ı kopyala
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app ./

# Startup script'i executable yap
RUN chmod +x scripts/start-with-migration.sh

# User'a geç
USER nodejs

# Port expose
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start komutu
CMD ["sh", "scripts/start-with-migration.sh"]