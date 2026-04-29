import { useCallback, useEffect, useState } from 'react';
import adminStatsApiService from '../services/adminStatsApi.service';

export function useAdminStats() {
  const [data, setData]       = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminStatsApiService.getOverview();
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
