import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import toast, { useToasterStore } from 'react-hot-toast';
import { usePlanLockToastGuard } from '../usePlanLockToastGuard';

/**
 * Trong lúc modal khoá gói hết hạn mở, toast LỖI chung của trang ("Không tải được dữ liệu") bị dẹp vì
 * `<Toaster>` zIndex 999999 nổi trên modal. Toast thành công / khác phải giữ nguyên.
 */

const useBoth = (active) => {
  usePlanLockToastGuard(active);
  return useToasterStore().toasts;
};

const byId = (toasts, id) => toasts.find((x) => x.id === id);

afterEach(() => {
  act(() => {
    toast.remove();
  });
});

describe('usePlanLockToastGuard', () => {
  it('active: toast lỗi đang hiện bị dismiss, toast thành công giữ nguyên', () => {
    const { result } = renderHook(() => useBoth(true));

    act(() => {
      toast.error('Không tải được dữ liệu', { id: 'err-1' });
      toast.success('Đã lưu', { id: 'ok-1' });
    });

    expect(byId(result.current, 'err-1').visible).toBe(false);
    expect(byId(result.current, 'ok-1').visible).toBe(true);
  });

  it('active: toast lỗi sinh SAU khi modal đã mở cũng bị dẹp', () => {
    const { result } = renderHook(() => useBoth(true));

    act(() => {
      toast.error('Lỗi đến muộn', { id: 'err-late' });
    });

    expect(byId(result.current, 'err-late').visible).toBe(false);
  });

  it('active: toast thông tin / custom (vd toast nâng cấp) không bị đụng tới', () => {
    const { result } = renderHook(() => useBoth(true));

    act(() => {
      toast('Thông tin', { id: 'blank-1' });
      toast.custom(() => null, { id: 'custom-1' });
    });

    expect(byId(result.current, 'blank-1').visible).toBe(true);
    expect(byId(result.current, 'custom-1').visible).toBe(true);
  });

  it('không active: toast lỗi giữ nguyên (không dẹp khi chưa có modal khoá)', () => {
    const { result } = renderHook(() => useBoth(false));

    act(() => {
      toast.error('Lỗi thật của trang', { id: 'err-keep' });
    });

    expect(byId(result.current, 'err-keep').visible).toBe(true);
  });
});
