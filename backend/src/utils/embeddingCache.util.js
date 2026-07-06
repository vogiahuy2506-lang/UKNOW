/**
 * In-memory LRU cache for embeddings.
 * Tự động evict entries cũ nhất khi đạt max size.
 */

class LRUCache {
  constructor(maxSize = 2000, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  clearByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  get size() {
    return this.cache.size;
  }

  get stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

const embeddingCache = new LRUCache(
  parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '2000', 10),
  parseInt(process.env.EMBEDDING_CACHE_TTL_MS || (5 * 60 * 1000).toString(), 10)
);

export function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export function getCacheKey(userId, feature, text) {
  const prefix = userId ? `${userId}:` : 'global:';
  const textHash = hashText(text);
  return `${prefix}${feature || 'default'}:${textHash}`;
}

export function getFromCache(key) {
  return embeddingCache.get(key);
}

export function setToCache(key, value) {
  embeddingCache.set(key, value);
}

export function clearCache(key) {
  if (key) {
    embeddingCache.delete(key);
  }
}

export function clearUserCache(userId) {
  if (userId) {
    embeddingCache.clearByPrefix(`${userId}:`);
  }
}

export function clearAllCache() {
  embeddingCache.clear();
}

export function getCacheStats() {
  return embeddingCache.stats;
}

export default embeddingCache;
