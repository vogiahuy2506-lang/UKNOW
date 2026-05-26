import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for infinite scrolling / load more pagination
 * @param {Function} fetchFn - Async function to fetch data (receives page number)
 * @param {number} pageSize - Items per page (default: 20)
 * @param {Function} extractItems - Function to extract items array from response
 */
export function useInfiniteScroll(fetchFn, pageSize = 20, extractItems = (data) => data) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchFn(page);
      const newItems = extractItems(response);

      if (newItems.length < pageSize) {
        setHasMore(false);
      }

      setItems(prev => page === 0 ? newItems : [...prev, ...newItems]);
      setPage(prev => prev + 1);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, page, pageSize, isLoading, hasMore, extractItems]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    reset();
    // Load first page after reset
    setTimeout(() => loadMore(), 0);
  }, [reset, loadMore]);

  return {
    items,
    isLoading,
    hasMore,
    error,
    loadMore,
    reset,
    refresh,
  };
}

export default useInfiniteScroll;
