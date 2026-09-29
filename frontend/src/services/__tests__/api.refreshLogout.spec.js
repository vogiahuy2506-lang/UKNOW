import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — refreshAccessToken() hỏng vì 429/5xx/mất mạng
 * không được đăng xuất; chỉ 401/403 (refresh token thật sự không hợp lệ) mới đăng xuất.
 * Gọi thẳng handler `rejected` mà api.js đăng ký ở api.interceptors.response.use (bỏ qua vòng
 * request/adapter thật — axios expose interceptor đã đăng ký qua .interceptors.response.handlers).
 * axios.post (refreshAccessToken dùng axios thô, không qua instance `api`) được mock riêng.
 */
const mockAxiosPost = vi.fn();
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, post: (...args) => mockAxiosPost(...args) },
  };
});

const httpError = (status) => Object.assign(new Error('http error'), { response: { status, data: {} } });
const networkError = () => new Error('Network Error');

let originalLocation;

beforeEach(async () => {
  vi.resetModules();
  mockAxiosPost.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('accessToken', 'old-access-token');
  originalLocation = window.location;
  delete window.location;
  // href phải là URL tuyệt đối thật — axios (isURLSameOrigin) tự new URL(window.location.href)
  // khi dựng instance; một path trần làm axios.create() ném "Invalid URL".
  window.location = { pathname: '/app/dashboard', href: 'http://localhost:3000/app/dashboard' };
});

afterEach(() => {
  window.location = originalLocation;
});

async function getRejectedHandler() {
  const { default: api } = await import('../api');
  const handlers = api.interceptors.response.handlers;
  return handlers[handlers.length - 1].rejected;
}

// Lỗi 401 của MỘT request bảo vệ (không phải auth endpoint) — kích hoạt nhánh refresh token.
function originalRequestUnauthorized() {
  return Object.assign(new Error('unauthorized'), {
    config: { url: '/customers', headers: {} },
    response: { status: 401, data: {} },
  });
}

describe('api.js — refresh token hỏng vì 429/5xx/mất mạng không được đăng xuất', () => {
  it('refresh trả 429 → KHÔNG điều hướng /login, token còn nguyên', async () => {
    mockAxiosPost.mockRejectedValue(httpError(429));
    const rejected = await getRejectedHandler();

    await expect(rejected(originalRequestUnauthorized())).rejects.toBeTruthy();

    expect(window.location.href).toBe('http://localhost:3000/app/dashboard'); // không đổi — không bị điều hướng
    expect(localStorage.getItem('accessToken')).toBe('old-access-token');
  });

  it('refresh trả 500 → KHÔNG điều hướng /login, token còn nguyên', async () => {
    mockAxiosPost.mockRejectedValue(httpError(500));
    const rejected = await getRejectedHandler();

    await expect(rejected(originalRequestUnauthorized())).rejects.toBeTruthy();

    expect(window.location.href).toBe('http://localhost:3000/app/dashboard');
    expect(localStorage.getItem('accessToken')).toBe('old-access-token');
  });

  it('refresh hỏng vì mất mạng (không có response) → KHÔNG điều hướng /login', async () => {
    mockAxiosPost.mockRejectedValue(networkError());
    const rejected = await getRejectedHandler();

    await expect(rejected(originalRequestUnauthorized())).rejects.toBeTruthy();

    expect(window.location.href).toBe('http://localhost:3000/app/dashboard');
  });

  it('refresh trả 401 → CÓ điều hướng /login (đăng xuất thật)', async () => {
    mockAxiosPost.mockRejectedValue(httpError(401));
    const rejected = await getRejectedHandler();

    await expect(rejected(originalRequestUnauthorized())).rejects.toBeTruthy();

    expect(window.location.href).toBe('/login');
  });

  it('refresh trả 403 → CÓ điều hướng /login (đăng xuất thật)', async () => {
    mockAxiosPost.mockRejectedValue(httpError(403));
    const rejected = await getRejectedHandler();

    await expect(rejected(originalRequestUnauthorized())).rejects.toBeTruthy();

    expect(window.location.href).toBe('/login');
  });

  // Review PR-C — lỗi TẠM của bước làm mới phải được trả ra cho nơi gọi, không phải lỗi 401 gốc: authStore.initialize()
  // quyết đăng xuất theo status nó nhận. Trả 401 gốc thì ca "access token hết hạn + F5 + làm mới bị 429" vẫn bị đăng xuất.
  it('refresh trả 429 → promise bị từ chối với status 429 (không phải 401 gốc)', async () => {
    mockAxiosPost.mockRejectedValue(httpError(429));
    const rejected = await getRejectedHandler();
    await expect(rejected(originalRequestUnauthorized())).rejects.toMatchObject({ response: { status: 429 } });
  });

  it('refresh hỏng vì mất mạng → promise bị từ chối KHÔNG mang status 401', async () => {
    mockAxiosPost.mockRejectedValue(networkError());
    const rejected = await getRejectedHandler();
    const err = await rejected(originalRequestUnauthorized()).catch((e) => e);
    expect(err?.response?.status).not.toBe(401);
  });
});

