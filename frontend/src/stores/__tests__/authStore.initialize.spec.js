import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — initialize() không được đăng xuất khi /auth/me
 * hỏng vì lý do TẠM THỜI (429 hạn mức đăng nhập, 5xx, mất mạng); chỉ đăng xuất khi 401/403 thật.
 * Khuôn theo authStore.refreshCurrentUser.spec.js — store THẬT, chỉ mock tầng gọi API.
 */
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const api = (await import('../../services/api')).default;
const { useAuthStore } = await import('../authStore');

const httpError = (status) => Object.assign(new Error('http error'), { response: { status } });
const networkError = () => new Error('Network Error'); // không có .response — đúng lỗi mất mạng thật

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('accessToken', 'fake-access-token');
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    activeContext: { type: 'self' },
    sessionCheckFailed: false,
  });
});

describe('authStore.initialize — 429/5xx/mất mạng không được đăng xuất', () => {
  it('/auth/me trả 429 → token còn, sessionCheckFailed: true, KHÔNG đăng xuất', async () => {
    api.get.mockRejectedValue(httpError(429));

    await useAuthStore.getState().initialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().sessionCheckFailed).toBe(true);
  });

  it('/auth/me trả 500 → token còn, sessionCheckFailed: true', async () => {
    api.get.mockRejectedValue(httpError(500));

    await useAuthStore.getState().initialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(useAuthStore.getState().sessionCheckFailed).toBe(true);
  });

  it('lỗi mạng (không có response) → token còn, sessionCheckFailed: true', async () => {
    api.get.mockRejectedValue(networkError());

    await useAuthStore.getState().initialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(useAuthStore.getState().sessionCheckFailed).toBe(true);
  });

  it('/auth/me trả 401 → token bị xoá, đăng xuất thật', async () => {
    api.get.mockRejectedValue(httpError(401));

    await useAuthStore.getState().initialize();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().sessionCheckFailed).toBe(false);
  });

  it('/auth/me trả 403 (tài khoản bị khoá/vô hiệu hoá) → token bị xoá, đăng xuất thật', async () => {
    api.get.mockRejectedValue(httpError(403));

    await useAuthStore.getState().initialize();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().sessionCheckFailed).toBe(false);
  });

  it('/auth/me thành công → isAuthenticated true, sessionCheckFailed về false', async () => {
    useAuthStore.setState({ sessionCheckFailed: true });
    api.get.mockResolvedValue({
      data: { data: { user: { id: 1, username: 'u1', role: 'user', memberships: [] } } },
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().sessionCheckFailed).toBe(false);
  });
});
