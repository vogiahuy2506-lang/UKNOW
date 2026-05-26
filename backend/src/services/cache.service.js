/**
 * Simple in-memory cache service
 * For production with multiple instances, consider Redis
 */

const cache = new Map();

// Default TTL in milliseconds
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

class CacheService {
  /**
   * Get a value from cache
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const item = cache.get(key);
    if (!item) return null;

    // Check if expired
    if (Date.now() > item.expiresAt) {
      cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set a value in cache
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = DEFAULT_TTL) {
    cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete a specific key
   * @param {string} key
   */
  delete(key) {
    cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Simple pattern (e.g., 'user:123:*')
   */
  deletePattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const item of cache.values()) {
      if (now > item.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      total: cache.size,
      valid: validCount,
      expired: expiredCount,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of cache.entries()) {
      if (now > item.expiresAt) {
        cache.delete(key);
      }
    }
  }

  /**
   * Memoize a function with caching
   * @param {Function} fn - Async function to memoize
   * @param {object} options
   * @param {number} options.ttl - Cache TTL in ms
   * @param {Function} options.keyGenerator - Generate cache key from function args
   */
  memoize(fn, { ttl = DEFAULT_TTL, keyGenerator = (...args) => JSON.stringify(args) } = {}) {
    return async (...args) => {
      const key = `memo:${fn.name}:${keyGenerator(...args)}`;
      const cached = this.get(key);
      if (cached !== null) {
        return cached;
      }

      const result = await fn(...args);
      this.set(key, result, ttl);
      return result;
    };
  }
}

const cacheService = new CacheService();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  cacheService.cleanup();
}, 5 * 60 * 1000);

export default cacheService;

// Helper functions for common caching patterns
export const cacheKeys = {
  userSettings: (userId, channel) => `settings:user:${userId}:${channel}`,
  chatbotSettings: (userId) => `settings:chatbot:${userId}`,
  conversationHistory: (conversationId) => `history:conv:${conversationId}`,
  kbMetadata: (kbId) => `kb:meta:${kbId}`,
  channelInfo: (userId, channel) => `channel:user:${userId}:${channel}`,
};

// TTL constants
export const CACHE_TTL = {
  SHORT: 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  VERY_LONG: 60 * 60 * 1000, // 1 hour
};
