// src/middlewares/cache.middleware.js
const redisClient = require('../../config/redis');

/**
 * Cache TTL values in seconds
 */
const CACHE_TTL = {
  FEATURED: 300,      // 5 minutes
  TRENDING: 120,      // 2 minutes
  CATEGORY: 600,      // 10 minutes
  SEARCH: 300,        // 5 minutes
  SIMILAR: 600,       // 10 minutes
  CATEGORIES: 1800    // 30 minutes
};

/**
 * Generate cache key from request
 */
function generateCacheKey(prefix, req) {
  const params = { ...req.query, ...req.params };
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join(':');

  return `${prefix}${sortedParams ? ':' + sortedParams : ''}`;
}

/**
 * Cache middleware factory
 * @param {string} prefix - Cache key prefix
 * @param {number} ttl - Time to live in seconds
 */
function cacheMiddleware(prefix, ttl = 300) {
  return async (req, res, next) => {
    // Skip cache if explicitly requested
    if (req.query.noCache === 'true') {
      return next();
    }

    const cacheKey = generateCacheKey(prefix, req);

    try {
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached);
        data.cached = true;
        data.cachedAt = data.cachedAt || new Date().toISOString();
        return res.status(200).json(data);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = async (data) => {
        // Only cache successful responses
        if (data.success) {
          try {
            data.cachedAt = new Date().toISOString();
            await redisClient.setEx(cacheKey, ttl, JSON.stringify(data));
          } catch (cacheError) {
            console.error('Cache write error:', cacheError);
          }
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Continue without cache on error
      next();
    }
  };
}

/**
 * Invalidate cache by pattern
 */
async function invalidateCache(pattern) {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Invalidated ${keys.length} cache keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Pre-configured cache middlewares
 */
const cacheFeatured = cacheMiddleware('markets:featured', CACHE_TTL.FEATURED);
const cacheTrending = cacheMiddleware('markets:trending', CACHE_TTL.TRENDING);
const cacheCategory = cacheMiddleware('markets:category', CACHE_TTL.CATEGORY);
const cacheSearch = cacheMiddleware('markets:search', CACHE_TTL.SEARCH);
const cacheSimilar = cacheMiddleware('markets:similar', CACHE_TTL.SIMILAR);
const cacheCategories = cacheMiddleware('markets:categories', CACHE_TTL.CATEGORIES);

module.exports = {
  cacheMiddleware,
  generateCacheKey,
  invalidateCache,
  CACHE_TTL,
  cacheFeatured,
  cacheTrending,
  cacheCategory,
  cacheSearch,
  cacheSimilar,
  cacheCategories
};
