import { QueryClient } from '@tanstack/react-query';

/**
 * Global QueryClient instance for TanStack Query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Do not retry 4xx errors (client errors, authentication, validation)
        const status = error?.response?.status || error?.status;
        if (status && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

/**
 * Clear and cancel all queries in cache.
 * Must be invoked on logout and workspace context switch.
 */
export const clearQueryCache = async () => {
  try {
    await queryClient.cancelQueries();
    queryClient.clear();
  } catch (err) {
    console.warn('[QueryClient] Failed to clear query cache:', err);
  }
};

export default queryClient;
