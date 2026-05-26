import { useState, useEffect } from 'react';

/**
 * Custom hook for lazy loading data with automatic refetching
 * @param {Function} fetchFn - Async function to fetch data
 * @param {Array} deps - Dependencies that trigger refetch
 * @param {object} options
 * @param {boolean} options.immediate - Whether to fetch immediately (default: true)
 * @param {number} options.refreshInterval - Auto-refresh interval in ms (default: 0 = disabled)
 */
export function useLazyData(fetchFn, deps = [], options = {}) {
  const { immediate = true, refreshInterval = 0 } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const fetch = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const refetch = () => fetch(false);

  useEffect(() => {
    if (immediate) {
      fetch(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetch(true);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval, ...deps]);

  return { data, isLoading, error, fetch: refetch };
}

export default useLazyData;
