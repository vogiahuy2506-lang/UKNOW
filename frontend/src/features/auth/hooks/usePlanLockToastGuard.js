import { useEffect } from 'react';
import toast, { useToasterStore } from 'react-hot-toast';

/**
 * Trong lúc modal khoá gói hết hạn đang mở, dẹp mọi toast LỖI đang hiện.
 *
 * Vì sao cần: các trang gọi API bị 403 PLAN_EXPIRED đều có `catch → toast.error('Không tải được dữ liệu')`
 * của riêng chúng, còn `<Toaster>` ở `App.jsx` có zIndex 999999 nên toast luôn nổi TRÊN modal — người dùng
 * thấy lỗi chung chung chồng lên lời giải thích đúng. Chỉ dẹp `type === 'error'`; toast thành công / thông
 * tin / custom (vd toast nâng cấp) giữ nguyên.
 *
 * @param {boolean} active true khi modal khoá đang mở
 */
export function usePlanLockToastGuard(active) {
  const { toasts } = useToasterStore();

  useEffect(() => {
    if (!active) return;
    toasts
      .filter((tst) => tst.type === 'error' && tst.visible)
      .forEach((tst) => toast.dismiss(tst.id));
  }, [active, toasts]);
}
