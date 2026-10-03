import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PLAN_XAC_THUC_HAI_LOP_2FA mục 5 việc 8 — 401 của /auth/2fa/verify (sai mã) và
 * /auth/google-login phải được coi là lỗi của auth endpoint: KHÔNG rơi vào nhánh refresh token
 * (nếu rơi vào, sai mã 2FA sẽ gọi /auth/refresh-token rồi đá người dùng về /login).
 */
const mockAxiosPost = vi.fn();
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, post: (...args) => mockAxiosPost(...args) },
  };
});

let originalLocation;

beforeEach(() => {
  vi.resetModules();
  mockAxiosPost.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  originalLocation = window.location;
  delete window.location;
  window.location = { pathname: '/login', href: 'http://localhost:3000/login' };
});

afterEach(() => {
  window.location = originalLocation;
});

async function getRejectedHandler() {
  const { default: api } = await import('../api');
  const handlers = api.interceptors.response.handlers;
  return handlers[handlers.length - 1].rejected;
}

const unauthorizedAt = (url) =>
  Object.assign(new Error('unauthorized'), {
    config: { url, headers: {} },
    response: { status: 401, data: { message: 'Mã không đúng' } },
  });

describe('api.js — endpoint 2FA / Google login là auth endpoint', () => {
  it.each(['/auth/2fa/verify', '/auth/google-login'])(
    '401 từ %s → trả lỗi nguyên bản, KHÔNG gọi refresh token',
    async (url) => {
      const rejected = await getRejectedHandler();
      const err = unauthorizedAt(url);

      await expect(rejected(err)).rejects.toBe(err);

      expect(mockAxiosPost).not.toHaveBeenCalled();
    },
  );
});
