import { beforeEach, describe, expect, it, vi } from 'vitest';

// Store THẬT, chỉ mock tầng gọi API (cùng khuôn authStore.refreshCurrentUser.spec.js).
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const api = (await import('../../services/api')).default;
const { useAuthStore } = await import('../authStore');

const sessionData = {
  user: { id: 7, username: 'u7', role: 'user' },
  accessToken: 'real-access-token',
};

describe('authStore — xác thực hai lớp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, activeContext: null });
  });

  it('login trả requiresTwoFactor → KHÔNG lưu token, KHÔNG isAuthenticated', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        data: { requiresTwoFactor: true, challengeToken: 'chal', rememberMe: true, method: 'local' },
      },
    });

    const result = await useAuthStore.getState().login('u7', 'pw', true);

    expect(result.data.requiresTwoFactor).toBe(true);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('googleLogin trả requiresTwoFactor → KHÔNG lưu token, KHÔNG isAuthenticated', async () => {
    api.post.mockResolvedValue({
      data: { success: true, data: { requiresTwoFactor: true, challengeToken: 'chal', method: 'google' } },
    });

    await useAuthStore.getState().googleLogin({ access_token: 'g' });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('login thường (chưa bật 2FA) vẫn lưu token và đăng nhập như cũ', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: sessionData } });

    await useAuthStore.getState().login('u7', 'pw', true);

    expect(localStorage.getItem('accessToken')).toBe('real-access-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user.id).toBe(7);
  });

  it('verifyTwoFactor gọi /auth/2fa/verify rồi lưu token + isAuthenticated', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: sessionData } });

    await useAuthStore.getState().verifyTwoFactor({ challengeToken: 'chal', code: '123456', rememberMe: true });

    expect(api.post).toHaveBeenCalledWith('/auth/2fa/verify', { challengeToken: 'chal', code: '123456' });
    expect(localStorage.getItem('accessToken')).toBe('real-access-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('verifyTwoFactor với rememberMe=false lưu token vào sessionStorage', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: sessionData } });

    await useAuthStore.getState().verifyTwoFactor({ challengeToken: 'chal', code: '123456', rememberMe: false });

    expect(sessionStorage.getItem('accessToken')).toBe('real-access-token');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('verifyTwoFactor sai mã → ném lỗi, không đăng nhập', async () => {
    api.post.mockRejectedValue({ response: { status: 401, data: { message: 'x' } } });

    await expect(
      useAuthStore.getState().verifyTwoFactor({ challengeToken: 'chal', code: '000000' }),
    ).rejects.toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
