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
    it('generates consistent SHA-256 hash for same text', () => {
      const hash1 = hashText('hello world');
      const hash2 = hashText('hello world');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('generates different hash for different text', () => {
      const hash1 = hashText('hello');
      const hash2 = hashText('world');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty text gracefully', () => {
      expect(hashText('')).toBe('');
      expect(hashText(null)).toBe('');
    });
  });

  describe('getCacheKey', () => {
    it('creates key with userId, feature, model, dimension, and hash', () => {
      const key = getCacheKey('user123', 'rag_query', 'test text', {
        model: 'gemini-embedding-001',
        outputDim: 768,
      });
      expect(key).toContain('user123:');
      expect(key).toContain('rag_query:');
      expect(key).toContain('gemini-embedding-001:');
      expect(key).toContain('768:');
    });

    it('creates key with global prefix when no userId', () => {
      const key = getCacheKey(null, 'default', 'test text', {
        model: 'gemini-embedding-001',
        outputDim: 768,
      });
      expect(key.startsWith('global:default:gemini-embedding-001:768:')).toBe(true);
    });

    it('creates key with default feature when not provided', () => {
      const key = getCacheKey('user1', null, 'test', {
        model: 'gemini-embedding-001',
        outputDim: 768,
      });
      expect(key).toContain('user1:');
      expect(key).toContain('default:');
    });

    it('produces different keys when model or outputDim changes', () => {
      const key768 = getCacheKey('user1', 'rag', 'same text', {
        model: 'gemini-embedding-001',
        outputDim: 768,
      });
      const key1536 = getCacheKey('user1', 'rag', 'same text', {
        model: 'gemini-embedding-001',
        outputDim: 1536,
      });
      const keyModel2 = getCacheKey('user1', 'rag', 'same text', {
        model: 'gemini-embedding-2',
        outputDim: 768,
      });

      expect(key768).not.toBe(key1536);
      expect(key768).not.toBe(keyModel2);
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
