import { LRUCache } from '../lruCache.util.js';

describe('LRUCache', () => {
  it('stores and retrieves values within TTL', () => {
    const cache = new LRUCache(10, 5000);
    cache.set('a', 123);
    expect(cache.get('a')).toBe(123);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('expires entries after TTL', async () => {
    const cache = new LRUCache(10, 50);
    cache.set('expiring', 'val');
    expect(cache.get('expiring')).toBe('val');

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('expiring')).toBeNull();
    expect(cache.has('expiring')).toBe(false);
  });

  it('supports custom per-entry TTL', async () => {
    const cache = new LRUCache(10, 5000);
    cache.set('short', 'val', 50);
    expect(cache.get('short')).toBe('val');

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('short')).toBeNull();
  });

  it('supports negativeTtlMs for null entries', async () => {
    const cache = new LRUCache(10, 5000, { negativeTtlMs: 50 });
    cache.set('missing_key', null);
    expect(cache.has('missing_key')).toBe(true);
    expect(cache.get('missing_key')).toBeNull();

    // After 60ms, negative cache entry should expire
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.has('missing_key')).toBe(false);
  });

  it('evicts oldest accessed entry when max size is reached', () => {
    const cache = new LRUCache(3, 5000);
    cache.set('k1', 1);
    cache.set('k2', 2);
    cache.set('k3', 3);

    // Access k1 to make k2 the oldest
    cache.get('k1');

    // Add 4th item -> k2 should be evicted
    cache.set('k4', 4);

    expect(cache.get('k1')).toBe(1);
    expect(cache.get('k2')).toBeNull();
    expect(cache.get('k3')).toBe(3);
    expect(cache.get('k4')).toBe(4);
    expect(cache.stats.evictions).toBe(1);
  });

  it('tracks hits, misses, evictions, and hitRate in stats', () => {
    const cache = new LRUCache(5, 5000);
    cache.set('a', 10);

    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('missing'); // miss

    const stats = cache.stats;
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.6667);
  });

  it('remember() deduplicates concurrent loaders (singleflight)', async () => {
    const cache = new LRUCache(10, 5000);
    let loaderCallCount = 0;

    const loader = async () => {
      loaderCallCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { data: 'loaded_data' };
    };

    // Run 20 concurrent requests for the same key
    const promises = Array.from({ length: 20 }).map(() =>
      cache.remember('shared_key', loader)
    );

    const results = await Promise.all(promises);

    expect(loaderCallCount).toBe(1);
    expect(results).toHaveLength(20);
    expect(results[0]).toEqual({ data: 'loaded_data' });
    expect(cache.get('shared_key')).toEqual({ data: 'loaded_data' });
  });

  it('prevents subsequent requests from joining stale in-flight loader after invalidation', async () => {
    const cache = new LRUCache(10, 5000);

    // Request A starts a slow loader returning 'stale'
    const slowLoaderPromise = cache.remember('doc:1', async () => {
      await new Promise((r) => setTimeout(r, 60));
      return { content: 'stale' };
    });

    // Invalidation occurs after 10ms
    await new Promise((r) => setTimeout(r, 10));
    cache.delete('doc:1');

    // Request B comes in after invalidation, starts fresh loader
    const freshLoaderPromise = cache.remember('doc:1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { content: 'fresh' };
    });

    const [resultA, resultB] = await Promise.all([slowLoaderPromise, freshLoaderPromise]);

    expect(resultA).toEqual({ content: 'stale' });
    expect(resultB).toEqual({ content: 'fresh' });
    // Cache should contain fresh data
    expect(cache.get('doc:1')).toEqual({ content: 'fresh' });
  });

  it('remember() increments misses on cold load and hits on subsequent reads', async () => {
    const cache = new LRUCache(10, 5000);

    // 1st call: cold load (miss)
    await cache.remember('item:1', async () => 'value1');

    // 2nd call: cache hit (hit)
    await cache.remember('item:1', async () => 'value1_fresh');

    const stats = cache.stats;
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });


  it('remember() with negativeTtlMs sets short TTL on null return', async () => {
    const cache = new LRUCache(10, 5000, { negativeTtlMs: 50 });

    await cache.remember('not_found', async () => null);

    expect(cache.has('not_found')).toBe(true);

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.has('not_found')).toBe(false);
  });

  it('clearByPrefix removes matching keys and increments versions', async () => {
    const cache = new LRUCache(10, 5000);
    cache.set('user:1:profile', { name: 'A' });
    cache.set('user:1:settings', { theme: 'dark' });
    cache.set('user:2:profile', { name: 'B' });

    cache.clearByPrefix('user:1:');

    expect(cache.get('user:1:profile')).toBeNull();
    expect(cache.get('user:1:settings')).toBeNull();
    expect(cache.get('user:2:profile')).toEqual({ name: 'B' });
  });
});
