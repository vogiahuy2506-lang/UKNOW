import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getStorageBackend,
  setStorageBackendForTest,
  resetStorageBackendForTest,
} from '../storageBackend.js';
import { LocalStorageBackend } from '../localStorageBackend.js';
import { GcsStorageBackend } from '../gcsStorageBackend.js';

describe('storageBackend factory', () => {
  const originalEnv = process.env.STORAGE_BACKEND;

  beforeEach(() => {
    resetStorageBackendForTest();
  });

  afterEach(() => {
    process.env.STORAGE_BACKEND = originalEnv;
    resetStorageBackendForTest();
  });

  it('returns LocalStorageBackend by default', () => {
    delete process.env.STORAGE_BACKEND;
    const backend = getStorageBackend();
    expect(backend).toBeInstanceOf(LocalStorageBackend);
  });

  it('returns GcsStorageBackend when STORAGE_BACKEND=gcs', () => {
    process.env.STORAGE_BACKEND = 'gcs';
    const backend = getStorageBackend();
    expect(backend).toBeInstanceOf(GcsStorageBackend);
  });

  it('allows overriding for tests', () => {
    const mock = { getBuffer: () => Buffer.from('mock') };
    setStorageBackendForTest(mock);
    expect(getStorageBackend()).toBe(mock);
    resetStorageBackendForTest();
    expect(getStorageBackend()).toBeInstanceOf(LocalStorageBackend);
  });
});
