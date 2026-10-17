import { useEffect, useState } from 'react';
import userDeliveryMonitorApiService from '../../campaign/services/userDeliveryMonitorApi.service';

export const LATEST_RUN_REFRESH_INTERVAL_MS = 60000;
const IDLE = Object.freeze({ status: 'idle', run: null });

/**
 * Lượt chạy gần nhất của một chiến dịch cho mục "Lần chạy gần nhất" ở tab Thiết lập
 * (`GET /delivery-monitor/campaigns/:id/latest-run`). Số đã gửi / chưa gửi được do backend lấy qua sendStats — hook này
 * KHÔNG tự đếm và KHÔNG đọc bộ đếm của `campaign_runs`.
 *
 * @param {number|string|null} campaignId `null` (chiến dịch mới) = idle
 * @param {string|number|null} [refreshKey] đổi giá trị → tải lại (vd id + trạng thái của lượt mới nhất khi trang theo dõi)
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', run: object|null }} `run = null` khi chưa chạy lần nào
 */
export default function useCampaignLatestRun(campaignId, refreshKey = null) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!campaignId) {
      setState(IDLE);
      return undefined;
    }
    let alive = true;
    let timer = null;
    const load = async (isFirst) => {
      if (isFirst) setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading', run: null }));
      try {
        const response = await userDeliveryMonitorApiService.getCampaignLatestRun(campaignId);
        if (!alive) return;
        const run = response?.data?.data?.run || null;
        setState({ status: 'ready', run });
        // Lượt đang chạy thì số còn tăng: tải lại mỗi phút. Xong / dừng thì thôi.
        if (run?.status === 'running' && !timer) {
          timer = setInterval(() => load(false), LATEST_RUN_REFRESH_INTERVAL_MS);
        } else if (run?.status !== 'running' && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        if (alive && isFirst) setState({ status: 'error', run: null });
      }
    };
    load(true);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [campaignId, refreshKey]);

  return state;
}
