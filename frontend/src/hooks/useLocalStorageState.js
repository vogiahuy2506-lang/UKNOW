import { useState, useEffect } from 'react';

/**
 * useState backed by localStorage. Value is JSON-serialised on every change.
 *
 * @param {string} key  - localStorage key
 * @param {*} defaultValue - initial value (or factory function)
 */
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch {
      // ignore corrupted storage
    }
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage quota errors
    }
  }, [key, value]);

  return [value, setValue];
}
