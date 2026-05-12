import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOrCreateLandingVisitorId } from '../landingVisitorId';

const STORAGE_KEY = 'founder_landing_vid';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getOrCreateLandingVisitorId', () => {
  it('lần đầu tiên: tạo UUID mới + lưu vào localStorage', () => {
    const v = getOrCreateLandingVisitorId();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(8);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(v);
  });

  it('lần thứ 2: trả về ID đã lưu (stable)', () => {
    const first = getOrCreateLandingVisitorId();
    const second = getOrCreateLandingVisitorId();
    expect(second).toBe(first);
  });

  it('localStorage có giá trị whitespace → coi như không có, tạo mới', () => {
    localStorage.setItem(STORAGE_KEY, '   ');
    const v = getOrCreateLandingVisitorId();
    expect(v).not.toBe('   ');
    expect(v.trim()).toBe(v);
  });

  it('crypto.randomUUID không có → fallback v_<timestamp>_<random>', () => {
    const originalCrypto = globalThis.crypto;
    // jsdom có crypto.randomUUID; ta stub cho test fallback path.
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });
    try {
      const v = getOrCreateLandingVisitorId();
      expect(v).toMatch(/^v_\d+_[a-z0-9]{10}$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it('localStorage throw → fallback anon_<timestamp>', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });
    const v = getOrCreateLandingVisitorId();
    expect(v).toMatch(/^anon_\d+$/);
  });
});
