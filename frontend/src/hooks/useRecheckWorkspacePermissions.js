import { useCallback, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

/**
 * Nút "Tôi đã được cấp quyền — kiểm tra lại" (PLAN_NHAN_VIEN mục 5.2/5.3): gọi làm mới hồ sơ và cho
 * biết kết quả để màn hình nói được "vẫn chưa thấy quyền mới" thay vì im lặng.
 *
 * `result`: null (chưa bấm) | 'updated' (quyền/không gian có đổi) | 'unchanged' | 'failed'.
 * Khi 'updated' thì store đã đổi nên màn hình tự dựng lại — hook không cần điều hướng.
 */
export function useRecheckWorkspacePermissions() {
  const refreshCurrentUser = useAuthStore((state) => state.refreshCurrentUser);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState(null);

  const recheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const outcome = await refreshCurrentUser();
      if (!outcome?.success) setResult('failed');
      else setResult(outcome.contextChanged ? 'updated' : 'unchanged');
    } finally {
      setIsChecking(false);
    }
  }, [refreshCurrentUser]);

  return { recheck, isChecking, result };
}

export default useRecheckWorkspacePermissions;
