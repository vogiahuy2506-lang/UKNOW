/**
 * Generic In-Memory LRU Cache with TTL, singleflight deduplication, and prefix eviction.
 * Tự động loại bỏ entries cũ nhất khi đạt maxSize hoặc khi đã hết hạn.
 * Hỗ trợ generation/version tracking trên từng key để ngăn in-flight loader ghi đè dữ liệu stale sau khi bị invalidate.
 */

export class LRUCache {
  /**
   * @param {number} [maxSize=2000] - Số lượng phần tử tối đa trong cache
   * @param {number} [ttlMs=300000] - Thời gian sống mặc định của mỗi phần tử (ms)
   * @param {object} [options={}]
   * @param {number} [options.negativeTtlMs] - TTL mặc định cho các giá trị null / không tìm thấy (ms)
   */
  constructor(maxSize = 2000, ttlMs = 5 * 60 * 1000, options = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.negativeTtlMs = options.negativeTtlMs;
    this.cache = new Map();
    this.inFlight = new Map();
    this.keyVersions = new Map();
    this.globalVersion = 0;
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._sets = 0;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this._misses += 1;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this._misses += 1;
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    this._hits += 1;
    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} [customTtlMs] - TTL tuỳ chỉnh cho entry này (nếu không truyền sẽ dùng default ttlMs hoặc negativeTtlMs)
   */
  set(key, value, customTtlMs) {
    this._sets += 1;
    let ttl = this.ttlMs;

    if (Number.isFinite(customTtlMs) && customTtlMs > 0) {
      ttl = customTtlMs;
    } else if (value === null && Number.isFinite(this.negativeTtlMs) && this.negativeTtlMs > 0) {
      ttl = this.negativeTtlMs;
    }

    // Delete existing key if present to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this._evictions += 1;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Singleflight loader: nếu key có trong cache thì trả về ngay;
   * nếu đang có request cùng nạp key này, tái sử dụng Promise đang chạy;
   * nếu chưa có, gọi loader, lưu cache và trả về.
   *
   * @param {string} key
   * @param {number|Function} ttlMsOrLoader - TTL tuỳ chỉnh (ms) hoặc hàm loader
   * @param {Function} [maybeLoader] - Hàm loader nếu tham số thứ 2 là ttlMs
   * @returns {Promise<*>}
   */
  async remember(key, ttlMsOrLoader, maybeLoader) {
    const customTtl = typeof ttlMsOrLoader === 'number' ? ttlMsOrLoader : undefined;
    const loader = typeof ttlMsOrLoader === 'function' ? ttlMsOrLoader : maybeLoader;

    if (typeof loader !== 'function') {
      throw new TypeError('LRUCache.remember requires a loader function');
    }

    if (this.has(key)) {
      return this.get(key);
    }

    // Ghi nhận cache miss
    this._misses += 1;

    const currentKeyVersion = this.keyVersions.get(key) || 0;
    const currentGlobalVersion = this.globalVersion;

    const inFlightEntry = this.inFlight.get(key);
    if (inFlightEntry) {
      if (
        inFlightEntry.keyVersion === currentKeyVersion &&
        inFlightEntry.globalVersion === currentGlobalVersion
      ) {
        return inFlightEntry.promise;
      }
    }

    const startKeyVersion = currentKeyVersion;
    const startGlobalVersion = currentGlobalVersion;

    let promise;
    promise = (async () => {
      try {
        const val = await loader();
        const latestKeyVersion = this.keyVersions.get(key) || 0;
        // Chỉ lưu vào cache nếu key không bị delete/invalidate/clear trong lúc loader đang chạy
        if (
          latestKeyVersion === startKeyVersion &&
          this.globalVersion === startGlobalVersion
        ) {
          this.set(key, val, customTtl);
        }
        return val;
      } finally {
        if (this.inFlight.get(key)?.promise === promise) {
          this.inFlight.delete(key);
        }
      }
    })();

    this.inFlight.set(key, {
      promise,
      keyVersion: startKeyVersion,
      globalVersion: startGlobalVersion,
    });
    return promise;
  }

  delete(key) {
    const currentVersion = this.keyVersions.get(key) || 0;
    this.keyVersions.set(key, currentVersion + 1);
    this.inFlight.delete(key);

    // Limit memory size of keyVersions map
    if (this.keyVersions.size > this.maxSize * 2) {
      const firstKey = this.keyVersions.keys().next().value;
      if (firstKey !== undefined) this.keyVersions.delete(firstKey);
    }

    return this.cache.delete(key);
  }


  clear() {
    this.cache.clear();
    this.inFlight.clear();
    this.keyVersions.clear();
    this.globalVersion += 1;
  }

  clearByPrefix(prefix) {
    if (!prefix) return;
    this.globalVersion += 1;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        const currentVersion = this.keyVersions.get(key) || 0;
        this.keyVersions.set(key, currentVersion + 1);
      }
    }
  }

  resetStats() {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._sets = 0;
  }

  get stats() {
    const totalRequests = this._hits + this._misses;
    const hitRate = totalRequests > 0 ? Number((this._hits / totalRequests).toFixed(4)) : 0;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      sets: this._sets,
      hitRate,
    };
  }


  get size() {
    return this.cache.size;
  }
}

export default LRUCache;
