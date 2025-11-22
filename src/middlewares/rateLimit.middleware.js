// src/middlewares/rateLimit.middleware.js
const redisClient = require('../../config/redis');
const ApiError = require('../utils/apiError');

const RATE_LIMIT_PREFIX = 'ratelimit:';

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} options.keyPrefix - Prefix for Redis key (default: 'default')
 * @param {string} options.message - Error message when limit exceeded
 * @param {boolean} options.skipFailedRequests - Don't count failed requests (default: false)
 * @param {Function} options.keyGenerator - Custom key generator function (req) => string
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    max = 100,
    keyPrefix = 'default',
    message = 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress || 'unknown'
  } = options;

  return async (req, res, next) => {
    try {
      const key = `${RATE_LIMIT_PREFIX}${keyPrefix}:${keyGenerator(req)}`;
      const windowSeconds = Math.ceil(windowMs / 1000);

      // Get current count
      const current = await redisClient.get(key);
      const currentCount = current ? parseInt(current) : 0;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - currentCount - 1));

      if (currentCount >= max) {
        // Get TTL for Retry-After header
        const ttl = await redisClient.ttl(key);
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);
        res.setHeader('X-RateLimit-Reset', Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));

        throw ApiError.tooManyRequests(message);
      }

      // Increment counter
      if (currentCount === 0) {
        // First request in window - set with expiration
        await redisClient.setEx(key, windowSeconds, '1');
      } else {
        // Increment existing counter
        await redisClient.incr(key);
      }

      // Handle skipFailedRequests
      if (skipFailedRequests) {
        res.on('finish', async () => {
          if (res.statusCode >= 400) {
            // Decrement on failed request
            try {
              await redisClient.decr(key);
            } catch (err) {
              console.error('Rate limit decrement error:', err);
            }
          }
        });
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        return next(error);
      }
      // If Redis fails, allow the request
      console.error('Rate limit error:', error);
      next();
    }
  };
}

// Pre-configured rate limiters for common use cases

// Auth endpoints - strict limits
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  keyPrefix: 'auth',
  message: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.',
  skipFailedRequests: false
});

// Login - even stricter
const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour per IP
  keyPrefix: 'login',
  message: 'Çok fazla başarısız giriş denemesi. Lütfen 1 saat bekleyin.',
  skipFailedRequests: true // Only count failed attempts
});

// Registration - prevent spam
const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  keyPrefix: 'register',
  message: 'Çok fazla kayıt denemesi. Lütfen 1 saat bekleyin.'
});

// Password reset - prevent abuse
const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  keyPrefix: 'password-reset',
  message: 'Çok fazla şifre sıfırlama talebi. Lütfen 1 saat bekleyin.'
});

// General API - lenient
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'api',
  message: 'Çok fazla istek. Lütfen biraz bekleyin.'
});

// Order placement - prevent spam orders
const orderRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 orders per minute
  keyPrefix: 'order',
  message: 'Çok fazla emir verdiniz. Lütfen biraz bekleyin.',
  keyGenerator: (req) => req.user?.id || req.ip
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  orderRateLimiter
};
