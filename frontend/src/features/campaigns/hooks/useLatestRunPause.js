import { useCallback, useEffect, useRef, useState } from 'react';
import campaignRunApiService from '../services/campaignRunApi.service';
import { getActiveRunPause } from '../utils/campaignQuotaPause.helpers';

export const LATEST_RUN_PAUSE_POLL_INTERVAL_MS = 60000;

/**
 * Hook tải và theo dõi lượt chạy gần nhất của chiến dịch để tính trạng thái tạm dừng (activePause).
 * - Mount khi có campaignId: gọi API `campaignId=${id}&limit=1`.
 * - Khi lượt chạy gần nhất mang status 'running': poll mỗi 60 giây.
 * - Khi status khác 'running' hoặc unmount: huỷ timer poll.
 *
 * @param {number|string|null|undefined} campaignId
 * @returns {{ activePause: object|null, latestRun: object|null, refetch: () => Promise<void> }}
 */
export function useLatestRunPause(campaignId) {
  const [activePause, setActivePause] = useState(null);
  const [latestRun, setLatestRun] = useState(null);
  const pollTimerRef = useRef(null);

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const fetchLatestRunPause = useCallback(async () => {
    if (!campaignId) {
      setActivePause(null);
      setLatestRun(null);
      clearPollTimer();
      return;
    }

    try {
      const res = await campaignRunApiService.getCampaignRuns(`campaignId=${campaignId}&limit=1`);
      const history = res.data?.data || [];
      const run = history[0] || null;
      setLatestRun(run);
      const pause = getActiveRunPause(run?.runMetadata);
      setActivePause(pause);

      if (run?.status === 'running') {
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(() => {
            fetchLatestRunPause();
          }, LATEST_RUN_PAUSE_POLL_INTERVAL_MS);
        }
      } else {
        clearPollTimer();
      }
    } catch {
      // Yên lặng khi fetch lỗi, không làm đứt flow UI
    }
  }, [campaignId]);

  useEffect(() => {
    fetchLatestRunPause();
    return () => {
      clearPollTimer();
    };
  }, [fetchLatestRunPause]);

  return {
    activePause,
    latestRun,
    refetch: fetchLatestRunPause,
  };
}

export default useLatestRunPause;
