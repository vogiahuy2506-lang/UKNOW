import { LocalStorageBackend } from './localStorageBackend.js';
import { GcsStorageBackend } from './gcsStorageBackend.js';

let activeBackendInstance = null;
let testBackendOverride = null;

/**
 * Lấy storage backend đang hoạt động.
 * @returns {LocalStorageBackend | GcsStorageBackend}
 */
export function getStorageBackend() {
  if (testBackendOverride) {
    return testBackendOverride;
  }

  if (activeBackendInstance) {
    return activeBackendInstance;
  }

  const backendType = String(process.env.STORAGE_BACKEND || 'local').toLowerCase().trim();
  if (backendType === 'gcs') {
    activeBackendInstance = new GcsStorageBackend();
    return activeBackendInstance;
  }

  activeBackendInstance = new LocalStorageBackend();
  return activeBackendInstance;
}

export function setStorageBackendInstance(instance) {
  activeBackendInstance = instance;
}

export function setStorageBackendForTest(mockBackend) {
  testBackendOverride = mockBackend;
}

export function resetStorageBackendForTest() {
  testBackendOverride = null;
  activeBackendInstance = null;
}
