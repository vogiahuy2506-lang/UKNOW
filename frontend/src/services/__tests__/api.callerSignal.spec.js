import { describe, it, expect } from 'vitest';
import api from '../api';

/**
 * Lệnh giao 21/09/2026, PR-3. Interceptor khử trùng của api.js:
 *  - khoá `method:url:params` (không có body) → lượt mới HUỶ lượt cũ đang bay;
 *  - dòng `config.signal = controller.signal` GHI ĐÈ signal người gọi truyền vào.
 * Trang builder có hai nơi gọi GET /zalo/accounts (modal node và node runner — runner truyền { signal }),
 * nên lượt này huỷ lượt kia và danh sách tài khoản Zalo hiện rỗng dù production có 3 tài khoản.
 * Sửa: signal do người gọi truyền vào phải được TÔN TRỌNG — không ghi đè, không khử trùng.
 */

function makeAdapter(seen, delayMs = 10) {
  return (config) =>
    new Promise((resolve, reject) => {
      seen.push(config);
      const timer = setTimeout(() => {
        resolve({ data: { success: true, data: { url: config.url } }, status: 200, statusText: 'OK', headers: {}, config });
      }, delayMs);
      // adapter thật của axios phản ứng với signal — giả lập đúng điều đó
      config.signal?.addEventListener?.('abort', () => {
        clearTimeout(timer);
        const error = new Error('canceled');
        error.name = 'CanceledError';
        error.code = 'ERR_CANCELED';
        reject(error);
      });
    });
}

describe('api.js — tôn trọng signal do người gọi truyền vào', () => {
  it('config axios dùng đúng signal của người gọi (không bị ghi đè bằng signal của interceptor)', async () => {
    const seen = [];
    const controller = new AbortController();
    await api.get('/zalo/accounts', { adapter: makeAdapter(seen), signal: controller.signal });
    expect(seen[0].signal).toBe(controller.signal);
  });

  it('lượt có signal riêng và lượt không signal cùng URL chạy SONG SONG: không lượt nào huỷ lượt kia', async () => {
    const seen = [];
    const adapter = makeAdapter(seen);
    const controller = new AbortController();

    const results = await Promise.allSettled([
      api.get('/zalo/accounts', { adapter, signal: controller.signal }), // node runner
      api.get('/zalo/accounts', { adapter }),                              // lượt thường
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

    // đảo thứ tự: lượt không signal đi trước, lượt có signal đi sau
    const reversed = await Promise.allSettled([
      api.get('/zalo/accounts', { adapter }),
      api.get('/zalo/accounts', { adapter, signal: new AbortController().signal }),
    ]);
    expect(reversed.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('nhiều lượt cùng URL, mỗi lượt một signal riêng → tất cả thành công', async () => {
    const adapter = makeAdapter([]);
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => api.get('/zalo/accounts', { adapter, signal: new AbortController().signal })),
    );
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('người gọi tự huỷ signal của mình → lượt đó bị huỷ (đúng ý người gọi), lượt khác không bị ảnh hưởng', async () => {
    const adapter = makeAdapter([], 20);
    const mine = new AbortController();
    const first = api.get('/zalo/accounts', { adapter, signal: mine.signal });
    const other = api.get('/zalo/accounts', { adapter });
    mine.abort();

    const [a, b] = await Promise.allSettled([first, other]);
    expect(a.status).toBe('rejected');
    expect(a.reason?.code).toBe('ERR_CANCELED');
    expect(b.status).toBe('fulfilled');
  });

  it('lượt có signal riêng xong KHÔNG xoá sổ khử trùng của lượt không-signal đang bay: lượt sau vẫn huỷ lượt trước', async () => {
    const adapter = makeAdapter([], 30);
    const pending = api.get('/plans', { adapter });                                   // A: đang bay, có đăng ký khử trùng
    await api.get('/plans', { adapter: makeAdapter([], 0), signal: new AbortController().signal }); // B: có signal riêng, xong ngay
    const later = api.get('/plans', { adapter });                                     // C: cùng khoá với A

    const [a, c] = await Promise.allSettled([pending, later]);
    expect(a.status).toBe('rejected'); // khử trùng vẫn hoạt động: C huỷ A
    expect(a.reason?.name).toBe('CanceledError');
    expect(c.status).toBe('fulfilled');
  });

  it('hành vi cũ giữ nguyên: hai GET không signal cùng URL → lượt sau huỷ lượt trước', async () => {
    const adapter = makeAdapter([], 15);
    const results = await Promise.allSettled([api.get('/plans', { adapter }), api.get('/plans', { adapter })]);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
  });
});
