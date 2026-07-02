import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  hashText,
  getCacheKey,
  getFromCache,
  setToCache,
  clearCache,
  clearUserCache,
  clearAllCache,
  getCacheStats,
  default as embeddingCache,
} from '../embeddingCache.util.js';

describe('embeddingCache.util', () => {
  beforeEach(() => {
    clearAllCache();
  });

  describe('hashText', () => {
    it('generates consistent hash for same text', () => {
      const hash1 = hashText('hello world');
      const hash2 = hashText('hello world');
      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different text', () => {
      const hash1 = hashText('hello');
      const hash2 = hashText('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getCacheKey', () => {
    it('creates key with userId and feature', () => {
      const key = getCacheKey('user123', 'rag_query', 'test text');
      expect(key).toContain('user123:');
      expect(key).toContain('rag_query:');
    });

    it('creates key with global prefix when no userId', () => {
      const key = getCacheKey(null, 'default', 'test text');
      expect(key).toBe('global:default:');
    });

    it('creates key without feature when not provided', () => {
      const key = getCacheKey('user1', null, 'test');
      expect(key).toContain('user1:');
      expect(key).toContain('default:');
    });
  });

  describe('cache operations', () => {
    it('stores and retrieves values', () => {
      const key = 'test-key';
      const value = [0.1, 0.2, 0.3];
      setToCache(key, value);
      expect(getFromCache(key)).toEqual(value);
    });

    it('returns null for non-existent keys', () => {
      expect(getFromCache('non-existent')).toBeNull();
    });

    it('deletes specific key', () => {
      setToCache('key1', [1, 2]);
      setToCache('key2', [3, 4]);
      clearCache('key1');
      expect(getFromCache('key1')).toBeNull();
      expect(getFromCache('key2')).not.toBeNull();
    });

    it('clears all cache', () => {
      setToCache('key1', [1]);
      setToCache('key2', [2]);
      clearAllCache();
      expect(getFromCache('key1')).toBeNull();
      expect(getFromCache('key2')).toBeNull();
    });

    it('clears cache by user prefix', () => {
      setToCache('user1:feature:hash1', [1]);
      setToCache('user1:feature:hash2', [2]);
      setToCache('user2:feature:hash1', [3]);
      clearUserCache('user1');
      expect(getFromCache('user1:feature:hash1')).toBeNull();
      expect(getFromCache('user1:feature:hash2')).toBeNull();
      expect(getFromCache('user2:feature:hash1')).not.toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('returns cache statistics', () => {
      const stats = getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttlMs');
      expect(stats.maxSize).toBe(2000);
      expect(stats.ttlMs).toBe(5 * 60 * 1000);
    });

    it('tracks size correctly', () => {
      setToCache('key1', [1]);
      setToCache('key2', [2]);
      expect(getCacheStats().size).toBe(2);
    });
  });
});
