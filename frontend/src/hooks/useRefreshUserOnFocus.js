import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';

/** Giãn tối thiểu giữa hai lần làm mới do quay lại tab — đổi tab liên tục cũng không bắn /auth/me dồn dập. */
export const REFRESH_ON_FOCUS_MIN_GAP_MS = 60_000;

/**
 * Làm mới hồ sơ (memberships + quyền) khi người dùng QUAY LẠI tab (PLAN_NHAN_VIEN mục 5.3).
 * Chủ vừa cấp/đổi quyền hay thêm họ vào team thì nhân viên đang đăng nhập nhận được trong vòng một phút
 * sau khi quay lại tab — không cần F5 hay đăng xuất. Lần đầu tính từ lúc mount vì hồ sơ vừa được nạp.
 *
 * @param {{ enabled?: boolean, minGapMs?: number, now?: () => number }} [options]
 */
export function useRefreshUserOnFocus({
  enabled = true,
  minGapMs = REFRESH_ON_FOCUS_MIN_GAP_MS,
  now = Date.now,
} = {}) {
  const refreshCurrentUser = useAuthStore((state) => state.refreshCurrentUser);
  const lastRunAtRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    lastRunAtRef.current = now();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const current = now();
      if (current - lastRunAtRef.current < minGapMs) return;
      lastRunAtRef.current = current;
      refreshCurrentUser();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, minGapMs, now, refreshCurrentUser]);
}

export default useRefreshUserOnFocus;
