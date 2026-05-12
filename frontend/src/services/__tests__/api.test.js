/**
 * Test suite cho api.js — axios instance + interceptors.
 *
 * Phạm vi:
 *   - Request interceptor: gắn Bearer token, gắn X-Owner-Context khi context=employee.
 *   - Response interceptor 401:
 *       + auth endpoint → reject ngay (không refresh).
 *       + status ≠ 401 → reject nguyên error.
 *       + đã retry rồi → forceLogoutAndRedirect.
 *       + chưa retry → gọi /auth/refresh-token; success → retry; fail → forceLogout.
 *   - forceLogoutAndRedirect: clear store, set window.location.href='/login'.
 *
 * Khó khăn kỹ thuật:
 *   - axios instance được tạo lúc module load → interceptors gắn ngay. Ta gọi
 *     trực tiếp các handlers qua api.interceptors.request|response.handlers[i]
 *     để test logic mà không cần network thật.
 *   - axios.post (cho refresh-token) là call tới axios top-level (KHÔNG qua
 *     instance api), nên cần mock axios.post riêng.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock authStore (api.js import dynamic, nhưng mock module trước khi api.js
// import là an toàn nhất).
const mockGetState = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: {
    getState: mockGetState,
  },
}));

// ── Mock axios top-level (chỉ dùng cho refresh-token call). axios.create
// và instance vẫn dùng module thật để giữ logic interceptor chuẩn.
vi.mock('axios', async () => {
  const actual = await vi.importActual('axios');
  return {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(),
    },
  };
});

const axios = (await import('axios')).default;

/**
 * Fresh import của api module trước mỗi test → reset state module-level
 * (đặc biệt là `isForcingLogout` cờ chống re-entrance).
 */
let api;
let requestHandler;
let responseHandler;

const loadFreshApi = async () => {
  vi.resetModules();
  const mod = await import('../api');
  api = mod.default;
  requestHandler = api.interceptors.request.handlers[0];
  responseHandler = api.interceptors.response.handlers[0];
};

let originalLocation;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  axios.post.mockReset();
  mockGetState.mockReset();
  mockGetState.mockReturnValue({
    activeContext: { type: 'self' },
    logout: vi.fn().mockResolvedValue(undefined),
  });
  originalLocation = window.location;
  delete window.location;
  window.location = { pathname: '/dashboard', href: '/dashboard' };

  await loadFreshApi();
});

afterEach(() => {
  window.location = originalLocation;
});

// ───────────────────────────────────────── Request interceptor ─────
describe('Request interceptor', () => {
  it('không có token → không gắn Authorization', () => {
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('localStorage có token → gắn Bearer', () => {
    localStorage.setItem('accessToken', 'tok-local');
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer tok-local');
  });

  it('sessionStorage có token (localStorage rỗng) → gắn Bearer', () => {
    sessionStorage.setItem('accessToken', 'tok-session');
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer tok-session');
  });

  it('localStorage được ưu tiên hơn sessionStorage', () => {
    localStorage.setItem('accessToken', 'tok-L');
    sessionStorage.setItem('accessToken', 'tok-S');
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer tok-L');
  });

  it('activeContext=employee + ownerId → gắn X-Owner-Context', () => {
    mockGetState.mockReturnValue({
      activeContext: { type: 'employee', ownerId: 42 },
      logout: vi.fn(),
    });
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers['X-Owner-Context']).toBe('42');
  });

  it('activeContext=self → KHÔNG gắn X-Owner-Context', () => {
    const config = { headers: {} };
    const result = requestHandler.fulfilled(config);
    expect(result.headers['X-Owner-Context']).toBeUndefined();
  });

  it('request rejected → propagate', async () => {
    const err = new Error('Aborted');
    await expect(requestHandler.rejected(err)).rejects.toBe(err);
  });
});

// ───────────────────────────────────────── Response interceptor ────
describe('Response interceptor — fulfilled', () => {
  it('response 2xx → pass through nguyên response', () => {
    const resp = { data: { ok: true }, status: 200 };
    expect(responseHandler.fulfilled(resp)).toBe(resp);
  });
});

describe('Response interceptor — error', () => {
  it('non-401 → reject nguyên error, không retry', async () => {
    const err = { response: { status: 500 }, config: { url: '/users' } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('401 trên endpoint /auth/login → reject (không refresh)', async () => {
    const err = { response: { status: 401 }, config: { url: '/auth/login' } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('401 trên endpoint /auth/register → reject (không refresh)', async () => {
    const err = { response: { status: 401 }, config: { url: '/auth/register' } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('401 trên endpoint /auth/refresh-token → reject', async () => {
    const err = { response: { status: 401 }, config: { url: '/auth/refresh-token' } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('401 trên endpoint /auth/logout → reject', async () => {
    const err = { response: { status: 401 }, config: { url: '/auth/logout' } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('401 + đã _retry → forceLogout, redirect /login', async () => {
    const logoutFn = vi.fn().mockResolvedValue(undefined);
    mockGetState.mockReturnValue({ activeContext: { type: 'self' }, logout: logoutFn });

    const err = { response: { status: 401 }, config: { url: '/campaigns', _retry: true } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(logoutFn).toHaveBeenCalledWith({ skipServer: true });
    expect(window.location.href).toBe('/login');
  });

  it('401 chưa retry → call /auth/refresh-token, success → retry request', async () => {
    localStorage.setItem('accessToken', 'old-tok');
    axios.post.mockResolvedValue({
      data: { data: { accessToken: 'new-tok' } },
    });

    // Spy api(originalRequest) bằng cách stub adapter của instance để trả response.
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      headers: {},
      config: {},
      statusText: 'OK',
    });

    try {
      const err = {
        response: { status: 401 },
        config: { url: '/campaigns', headers: {}, method: 'get' },
      };
      const result = await responseHandler.rejected(err);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh-token'),
        {},
        { withCredentials: true }
      );
      // Token mới được lưu (localStorage vì key đang ở localStorage).
      expect(localStorage.getItem('accessToken')).toBe('new-tok');
      expect(err.config._retry).toBe(true);
      expect(err.config.headers.Authorization).toBe('Bearer new-tok');
      expect(result.data).toEqual({ ok: true });
    } finally {
      api.defaults.adapter = originalAdapter;
    }
  });

  it('401 chưa retry, refresh FAIL → forceLogout + redirect', async () => {
    localStorage.setItem('accessToken', 'old-tok');
    axios.post.mockRejectedValue(new Error('refresh failed'));
    const logoutFn = vi.fn().mockResolvedValue(undefined);
    mockGetState.mockReturnValue({ activeContext: { type: 'self' }, logout: logoutFn });

    const err = {
      response: { status: 401 },
      config: { url: '/campaigns', headers: {} },
    };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(logoutFn).toHaveBeenCalledWith({ skipServer: true });
    expect(window.location.href).toBe('/login');
  });

  it('forceLogout không redirect nếu đã ở /login', async () => {
    window.location.pathname = '/login';
    const logoutFn = vi.fn().mockResolvedValue(undefined);
    mockGetState.mockReturnValue({ activeContext: { type: 'self' }, logout: logoutFn });

    const err = { response: { status: 401 }, config: { url: '/campaigns', _retry: true } };
    await expect(responseHandler.rejected(err)).rejects.toBe(err);
    expect(logoutFn).toHaveBeenCalled();
    // href không bị đổi (vẫn là giá trị ban đầu).
    expect(window.location.href).toBe('/dashboard');
  });

  it('refresh-token success: token mới được lưu vào sessionStorage nếu key ở đó', async () => {
    sessionStorage.setItem('accessToken', 'old-tok');
    axios.post.mockResolvedValue({ data: { data: { accessToken: 'fresh-tok' } } });
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = vi.fn().mockResolvedValue({
      data: { ok: true }, status: 200, headers: {}, config: {}, statusText: 'OK',
    });

    try {
      const err = {
        response: { status: 401 },
        config: { url: '/campaigns', headers: {} },
      };
      await responseHandler.rejected(err);
      expect(sessionStorage.getItem('accessToken')).toBe('fresh-tok');
      expect(localStorage.getItem('accessToken')).toBeNull();
    } finally {
      api.defaults.adapter = originalAdapter;
    }
  });
});
