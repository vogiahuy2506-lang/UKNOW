import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dùng store THẬT (không mock cả useAuthStore) — chỉ mock tầng gọi API, giống pattern
// authStore.cacheIsolation.spec.js. Đây là finding review: PaymentSuccess.regression.spec.jsx
// mock toàn bộ authStore nên chưa chứng minh action thật cập nhật store hay giữ phiên khi 5xx.
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const api = (await import('../../services/api')).default;
const { useAuthStore } = await import('../authStore');

describe('authStore.refreshCurrentUser — store thật, không mock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, username: 'u1', role: 'user' },
      isAuthenticated: true,
      activeContext: { type: 'self' },
    });
  });

  it('happy path: cập nhật user trong store từ response /auth/me', async () => {
    api.get.mockResolvedValue({
      data: { data: { user: { id: 1, username: 'u1', role: 'user', active_plan_id: 42 } } },
    });

    const result = await useAuthStore.getState().refreshCurrentUser();

    expect(result.success).toBe(true);
    expect(useAuthStore.getState().user.activePlanId).toBe(42);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('lỗi mạng/5xx: KHÔNG xoá token/user, giữ nguyên phiên — chỉ trả success:false', async () => {
    const before = useAuthStore.getState().user;
    api.get.mockRejectedValue(new Error('network down'));

    const result = await useAuthStore.getState().refreshCurrentUser();

    expect(result.success).toBe(false);
    expect(useAuthStore.getState().user).toEqual(before);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('không gọi API khi chưa authenticated', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const result = await useAuthStore.getState().refreshCurrentUser();
    expect(result.success).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('single-flight: 2 lần gọi chồng nhau chỉ tạo 1 request API', async () => {
    let resolveApi;
    api.get.mockReturnValue(new Promise((resolve) => { resolveApi = resolve; }));

    const p1 = useAuthStore.getState().refreshCurrentUser();
    const p2 = useAuthStore.getState().refreshCurrentUser();
    expect(api.get).toHaveBeenCalledTimes(1);

    resolveApi({ data: { data: { user: { id: 1, username: 'u1', role: 'user' } } } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('response về sau khi đã đổi sang tài khoản khác (id khác) → bị bỏ qua, không ghi đè user hiện tại', async () => {
    let resolveApi;
    api.get.mockReturnValue(new Promise((resolve) => { resolveApi = resolve; }));

    const pending = useAuthStore.getState().refreshCurrentUser();
    // Trong lúc đang chờ response, user thực tế đã đổi sang tài khoản khác (login lại).
    useAuthStore.setState({ user: { id: 2, username: 'u2', role: 'user' }, isAuthenticated: true });

    resolveApi({ data: { data: { user: { id: 1, username: 'u1', role: 'user' } } } });
    const result = await pending;

    expect(result.success).toBe(false);
    expect(useAuthStore.getState().user.id).toBe(2);
  });
});
