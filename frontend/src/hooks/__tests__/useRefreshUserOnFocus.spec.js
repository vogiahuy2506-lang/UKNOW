/**
 * PLAN_NHAN_VIEN PR-3 mục 5.3 — quay lại tab thì làm mới hồ sơ, giãn tối thiểu 60 giây, chỉ khi bật.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const refreshCurrentUser = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ refreshCurrentUser }),
}));

const { useRefreshUserOnFocus, REFRESH_ON_FOCUS_MIN_GAP_MS } = await import('../useRefreshUserOnFocus');

let clock;
const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};
const comeBackToTab = () => {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.clearAllMocks();
  clock = 1_000_000;
  setVisibility('visible');
});

afterEach(() => {
  delete document.visibilityState;
});

const now = () => clock;

describe('useRefreshUserOnFocus', () => {
  it('quay lại tab sau ≥ 60 giây → gọi refreshCurrentUser', () => {
    renderHook(() => useRefreshUserOnFocus({ now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS;
    comeBackToTab();

    expect(refreshCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('quay lại tab trong vòng < 60 giây kể từ lúc mount → KHÔNG gọi (hồ sơ vừa nạp xong)', () => {
    renderHook(() => useRefreshUserOnFocus({ now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS - 1;
    comeBackToTab();

    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('đổi tab liên tục: hai lần quay lại cách nhau < 60 giây chỉ làm mới một lần', () => {
    renderHook(() => useRefreshUserOnFocus({ now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS;
    comeBackToTab();
    clock += 10_000;
    comeBackToTab();

    expect(refreshCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('sau khi đủ 60 giây kể từ lần làm mới trước → làm mới lần nữa', () => {
    renderHook(() => useRefreshUserOnFocus({ now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS;
    comeBackToTab();
    clock += REFRESH_ON_FOCUS_MIN_GAP_MS;
    comeBackToTab();

    expect(refreshCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('rời tab (visibilityState = hidden) → không gọi', () => {
    renderHook(() => useRefreshUserOnFocus({ now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS * 5;
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('enabled = false (chưa đăng nhập / admin) → không nghe sự kiện', () => {
    renderHook(() => useRefreshUserOnFocus({ enabled: false, now }));

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS * 5;
    comeBackToTab();

    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('gỡ component thì gỡ luôn bộ nghe sự kiện', () => {
    const { unmount } = renderHook(() => useRefreshUserOnFocus({ now }));
    unmount();

    clock += REFRESH_ON_FOCUS_MIN_GAP_MS * 5;
    comeBackToTab();

    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });
});
