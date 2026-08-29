/**
 * In-memory LRU cache for embeddings.
 * Tự động evict entries cũ nhất khi đạt max size.
 */

import crypto from 'crypto';
import { LRUCache } from './lruCache.util.js';

export { LRUCache };

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_DIM = 768;

const embeddingCache = new LRUCache(
  parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '2000', 10),
  parseInt(process.env.EMBEDDING_CACHE_TTL_MS || (5 * 60 * 1000).toString(), 10)
);

export function hashText(text) {
  if (!text) return '';
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

export function getCacheKey(userId, feature, text, { model, outputDim } = {}) {
  const prefix = userId ? `${userId}:` : 'global:';
  const m = model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const dim = outputDim || process.env.EMBEDDING_OUTPUT_DIM || DEFAULT_EMBEDDING_DIM;
  const textHash = hashText(text);
  return `${prefix}${feature || 'default'}:${m}:${dim}:${textHash}`;
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
