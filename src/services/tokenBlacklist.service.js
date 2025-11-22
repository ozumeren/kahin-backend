// src/services/tokenBlacklist.service.js
const redisClient = require('../../config/redis');

const TOKEN_BLACKLIST_PREFIX = 'blacklist:token:';
const USER_TOKENS_PREFIX = 'user:tokens:';

class TokenBlacklistService {
  /**
   * Add a token to the blacklist
   * @param {string} token - JWT token to blacklist
   * @param {number} expiresInSeconds - Time until token naturally expires
   */
  async blacklistToken(token, expiresInSeconds) {
    try {
      const key = `${TOKEN_BLACKLIST_PREFIX}${token}`;
      // Store with expiration matching the token's natural expiry
      await redisClient.setEx(key, expiresInSeconds, 'blacklisted');
      return true;
    } catch (error) {
      console.error('Token blacklist error:', error);
      return false;
    }
  }

  /**
   * Check if a token is blacklisted
   * @param {string} token - JWT token to check
   * @returns {boolean} - True if blacklisted
   */
  async isBlacklisted(token) {
    try {
      const key = `${TOKEN_BLACKLIST_PREFIX}${token}`;
      const result = await redisClient.get(key);
      return result !== null;
    } catch (error) {
      console.error('Token blacklist check error:', error);
      // Fail open - if Redis is down, allow the token
      return false;
    }
  }

  /**
   * Blacklist all tokens for a user (for forced logout)
   * @param {string} userId - User ID
   */
  async blacklistAllUserTokens(userId) {
    try {
      // Set a marker that invalidates all tokens issued before now
      const key = `${USER_TOKENS_PREFIX}${userId}:invalidated_before`;
      await redisClient.set(key, Date.now().toString());
      return true;
    } catch (error) {
      console.error('User token invalidation error:', error);
      return false;
    }
  }

  /**
   * Check if a token was issued before user's invalidation timestamp
   * @param {string} userId - User ID
   * @param {number} tokenIssuedAt - Token's iat claim (in seconds)
   * @returns {boolean} - True if token is invalidated
   */
  async isUserTokenInvalidated(userId, tokenIssuedAt) {
    try {
      const key = `${USER_TOKENS_PREFIX}${userId}:invalidated_before`;
      const invalidatedBefore = await redisClient.get(key);

      if (!invalidatedBefore) {
        return false;
      }

      // Convert tokenIssuedAt from seconds to milliseconds for comparison
      const tokenIssuedAtMs = tokenIssuedAt * 1000;
      return tokenIssuedAtMs < parseInt(invalidatedBefore);
    } catch (error) {
      console.error('User token check error:', error);
      return false;
    }
  }

  /**
   * Clean up invalidation marker for a user
   * @param {string} userId - User ID
   */
  async clearUserInvalidation(userId) {
    try {
      const key = `${USER_TOKENS_PREFIX}${userId}:invalidated_before`;
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Clear user invalidation error:', error);
      return false;
    }
  }
}

module.exports = new TokenBlacklistService();
