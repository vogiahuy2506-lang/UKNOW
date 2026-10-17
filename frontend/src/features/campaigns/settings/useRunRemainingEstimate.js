import { useEffect, useState } from 'react';
import userDeliveryMonitorApiService from '../../campaign/services/userDeliveryMonitorApi.service';
import { buildEstimateView } from '../utils/campaignEstimate.helpers';

const IDLE = Object.freeze({ status: 'idle', continuous: false, view: null });

/**
 * Thời gian CÒN LẠI của một lượt ĐANG CHẠY cho tab Thiết lập (`GET /delivery-monitor/runs/:runId/estimate`).
 * Cùng nguồn với dòng "Dự kiến xong" ở trang Giám sát gửi tin. Lỗi mạng / không có ước tính → `view: null` (tab chỉ ẩn dòng này).
 *
 * @param {number|string|null} runId lượt đang chạy; `null` = không chạy → idle
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', continuous: boolean, view: object|null }}
 */
export default function useRunRemainingEstimate(runId) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!runId) {
      setState(IDLE);
      return undefined;
    }
    let alive = true;
    setState({ status: 'loading', continuous: false, view: null });
    (async () => {
      try {
        const response = await userDeliveryMonitorApiService.getRunEstimate(runId);
        if (!alive) return;
        const body = response?.data?.data;
        setState({ status: 'ready', continuous: body?.continuous === true, view: buildEstimateView(body?.estimate) });
      } catch {
        if (alive) setState({ status: 'error', continuous: false, view: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [runId]);

  return state;
}
