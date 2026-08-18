import '@testing-library/jest-dom';

/**
 * Polyfill localStorage / sessionStorage cho Vitest + jsdom (Node ≥22).
 * Node 22 cờ cảnh báo `--localstorage-file` vì jsdom không thật sự expose các
 * storage API ra window — production app thì OK (browser), nhưng unit test
 * import authStore ở top-level sẽ throw. Mock in-memory tốt cho unit test.
 */
const buildMemoryStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
};

if (typeof window !== 'undefined') {
  if (typeof window.localStorage === 'undefined' || typeof window.localStorage.getItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      value: buildMemoryStorage(),
      writable: true,
      configurable: true,
    });
  }
  if (typeof window.sessionStorage === 'undefined' || typeof window.sessionStorage.getItem !== 'function') {
    Object.defineProperty(window, 'sessionStorage', {
      value: buildMemoryStorage(),
      writable: true,
      configurable: true,
    });
  }
}
