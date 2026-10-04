import { describe, it, expect } from 'vitest';
import api from '../api';

/**
 * 04/10/2026 — interceptor khử trùng của api.js chỉ được áp cho lệnh ĐỌC (GET).
 * Khoá khử trùng là `method:url:params` (không có body) nên hai lệnh GHI cùng URL khác nội dung
 * (Promise.all lưu nhiều mục, hai thao tác liền nhau) bị lượt sau huỷ lượt trước ngầm phía client.
 * Lỗi phụ: lượt CŨ bị huỷ trả lỗi → cleanup xoá khoá đang trỏ tới controller của lượt MỚI → lượt thứ ba
 * không huỷ được lượt thứ hai.
 */

/** Adapter giả: trả 200 sau `delayMs`; phản ứng với signal như adapter thật (reject CanceledError kèm config). */
function makeAdapter(seen, delayMs = 15) {
  return (config) =>
    new Promise((resolve, reject) => {
      seen.push(config);
      const timer = setTimeout(() => {
        resolve({ data: { success: true, data: { url: config.url, body: config.data } }, status: 200, statusText: 'OK', headers: {}, config });
      }, delayMs);
      config.signal?.addEventListener?.('abort', () => {
        clearTimeout(timer);
        const error = new Error('canceled');
        error.name = 'CanceledError';
        error.code = 'ERR_CANCELED';
        error.config = config;
        reject(error);
      });
    });
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('api.js — lệnh GHI không bị khử trùng', () => {
  it('hai POST cùng URL khác body chạy song song → CẢ HAI tới adapter và cả hai resolve', async () => {
    const seen = [];
    const adapter = makeAdapter(seen);

    const results = await Promise.allSettled([
      api.post('/customers/tags', { name: 'a' }, { adapter }),
      api.post('/customers/tags', { name: 'b' }, { adapter }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(seen).toHaveLength(2);
    expect(seen.map((c) => c.data)).toEqual([JSON.stringify({ name: 'a' }), JSON.stringify({ name: 'b' })]);
    // lệnh ghi đi thẳng: interceptor không gắn signal của nó
    expect(seen.every((c) => !c.signal)).toBe(true);
  });

  it.each([
    ['put', (adapter) => [api.put('/items/1', { v: 1 }, { adapter }), api.put('/items/1', { v: 2 }, { adapter })]],
    ['patch', (adapter) => [api.patch('/items/1', { v: 1 }, { adapter }), api.patch('/items/1', { v: 2 }, { adapter })]],
    ['delete', (adapter) => [api.delete('/items/1', { adapter, data: { r: 1 } }), api.delete('/items/1', { adapter, data: { r: 2 } })]],
    ['method viết hoa', (adapter) => [api({ method: 'POST', url: '/items', data: { v: 1 }, adapter }), api({ method: 'POST', url: '/items', data: { v: 2 }, adapter })]],
  ])('hai lệnh %s cùng URL song song → cả hai resolve', async (_name, start) => {
    const seen = [];
    const results = await Promise.allSettled(start(makeAdapter(seen)));
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(seen).toHaveLength(2);
  });

  it('POST không khoá lượt GET cùng URL: GET đang bay không bị POST huỷ, POST không bị GET huỷ', async () => {
    const adapter = makeAdapter([]);
    const results = await Promise.allSettled([
      api.get('/items', { adapter }),
      api.post('/items', { v: 1 }, { adapter }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });
});

describe('api.js — lệnh ĐỌC (GET) vẫn khử trùng', () => {
  it('hai GET cùng URL + params song song → lượt đầu bị huỷ, lượt sau resolve', async () => {
    const adapter = makeAdapter([]);

    const results = await Promise.allSettled([
      api.get('/plans', { adapter, params: { page: 1 } }),
      api.get('/plans', { adapter, params: { page: 1 } }),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[0].reason?.name).toBe('CanceledError');
    expect(results[1].status).toBe('fulfilled');
  });

  it('GET cùng URL nhưng params khác nhau → không huỷ nhau', async () => {
    const adapter = makeAdapter([]);
    const results = await Promise.allSettled([
      api.get('/plans', { adapter, params: { page: 1 } }),
      api.get('/plans', { adapter, params: { page: 2 } }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('không truyền method (mặc định get) hoặc viết hoa "GET" vẫn khử trùng như thường', async () => {
    const adapter = makeAdapter([]);
    const results = await Promise.allSettled([
      api({ url: '/plans-x', adapter }),
      api({ method: 'GET', url: '/plans-x', adapter }),
    ]);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
  });

  it('ba GET liên tiếp cùng khoá: lượt 1 bị huỷ (trả lỗi) SAU khi lượt 2 đăng ký → lượt 3 vẫn huỷ được lượt 2', async () => {
    const adapter = makeAdapter([], 40);

    const first = api.get('/plans', { adapter });   // lượt 1
    const second = api.get('/plans', { adapter });  // lượt 2 huỷ lượt 1 và đăng ký khoá
    first.catch(() => {}); // lượt 1 reject trước khi allSettled bên dưới gắn xử lý — tránh unhandled rejection
    await tick(5);                                 // để lỗi huỷ của lượt 1 chạy xong qua response interceptor (cleanup)
    const third = api.get('/plans', { adapter });   // lượt 3 phải còn thấy lượt 2 để huỷ

    const [a, b, c] = await Promise.allSettled([first, second, third]);
    expect(a.status).toBe('rejected');
    expect(a.reason?.name).toBe('CanceledError');
    expect(b.status).toBe('rejected');
    expect(b.reason?.name).toBe('CanceledError');
    expect(c.status).toBe('fulfilled');
  });

  it('lượt GET xong bình thường vẫn dọn khoá: lượt sau không bị coi là trùng với lượt đã xong', async () => {
    const adapter = makeAdapter([], 0);
    await api.get('/plans', { adapter });
    const second = await api.get('/plans', { adapter });
    expect(second.status).toBe(200);
  });
});
