import { useEffect, useState } from 'react';
import campaignRunApiService from '../services/campaignRunApi.service';

const IDLE = Object.freeze({ status: 'idle', estimate: null });

/**
 * Tải ước tính thời gian gửi của một chiến dịch đã lưu cho hộp "Chạy" / "Đặt lịch".
 *
 * - Gọi lại khi đổi `startAt` / `continuous` (debounce `debounceMs`), HUỶ request cũ bằng `AbortController`
 *   (`signal`) nên kết quả của giờ cũ không bao giờ ghi đè giờ mới.
 * - Lỗi (mạng, 5xx, hình dạng lạ) → `status: 'error'` — hộp chỉ hiện câu nhẹ, KHÔNG chặn nút Chạy/Đặt lịch.
 *
 * @param {{ campaignId: number|string|null, enabled: boolean, startAt?: string|null,
 *   continuous?: boolean, debounceMs?: number }} options
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', estimate: object|null }}
 */
export default function useCampaignEstimate({ campaignId, enabled, startAt = null, continuous = false, debounceMs = 400 }) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!enabled || !campaignId) {
      setState(IDLE);
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', estimate: null });

    const run = async () => {
      try {
        const response = await campaignRunApiService.getCampaignEstimate(
          campaignId,
          { startAt, continuous },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const data = response?.data?.data;
        if (!data || typeof data !== 'object') {
          setState({ status: 'error', estimate: null });
          return;
        }
        setState({ status: 'ready', estimate: data });
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
        setState({ status: 'error', estimate: null });
      }
    };

    const timer = setTimeout(run, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, campaignId, startAt, continuous, debounceMs]);

  return state;
}
