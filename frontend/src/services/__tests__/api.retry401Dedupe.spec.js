import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 04/10/2026 — khử trùng chỉ cho GET không được làm hỏng luồng thử lại sau 401:
 *  - GET: config thử lại mang signal do CHÍNH interceptor tạo → vẫn đi qua khử trùng như cũ;
 *  - lệnh ghi: thử lại đi thẳng; hai POST song song cùng URL cùng 401 → CẢ HAI thử lại thành công
 *    (trước đây lượt sau huỷ lượt trước nên chỉ một lượt tới nơi).
 * axios.post (refreshAccessToken dùng axios thô) được mock riêng, như api.refreshLogout.spec.js.
 */
const mockAxiosPost = vi.fn();
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, post: (...args) => mockAxiosPost(...args) },
  };
});

/** Adapter giả: mỗi URL+body trả 401 ở lần gọi đầu, 200 từ lần thứ hai (đúng cách server từ chối token cũ). */
function makeFlakyAdapter(calls) {
  const attempts = new Map();
  return (config) =>
    new Promise((resolve, reject) => {
      const key = `${config.method}:${config.url}:${String(config.data)}`;
      const n = (attempts.get(key) || 0) + 1;
      attempts.set(key, n);
      calls.push({ key, n, authorization: config.headers?.Authorization });
      setTimeout(() => {
        if (n === 1) {
          reject(Object.assign(new Error('unauthorized'), { config, response: { status: 401, data: {} } }));
        } else {
          resolve({ data: { success: true }, status: 200, statusText: 'OK', headers: {}, config });
        }
      }, 5);
    });
}

let api;

beforeEach(async () => {
  vi.resetModules();
  mockAxiosPost.mockReset();
  mockAxiosPost.mockResolvedValue({ data: { data: { accessToken: 'new-token' } } });
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('accessToken', 'old-token');
  ({ default: api } = await import('../api'));
});

describe('api.js — thử lại sau 401 khi khử trùng chỉ áp cho GET', () => {
  it('GET 401 → làm mới token → thử lại thành công với token mới', async () => {
    const calls = [];
    const response = await api.get('/customers', { adapter: makeFlakyAdapter(calls) });

    expect(response.status).toBe(200);
    expect(calls.map((c) => c.n)).toEqual([1, 2]);
    expect(calls[1].authorization).toBe('Bearer new-token');
  });

  it('hai POST song song cùng URL khác body cùng 401 → cả hai thử lại và cả hai resolve', async () => {
    const calls = [];
    const adapter = makeFlakyAdapter(calls);

    const results = await Promise.allSettled([
      api.post('/customers/tags', { name: 'a' }, { adapter }),
      api.post('/customers/tags', { name: 'b' }, { adapter }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    // mỗi lệnh đi đủ hai lượt (401 rồi 200): bốn lần gọi adapter, không lượt nào bị huỷ giữa chừng
    expect(calls).toHaveLength(4);
    expect(calls.filter((c) => c.n === 2)).toHaveLength(2);
  });
});
