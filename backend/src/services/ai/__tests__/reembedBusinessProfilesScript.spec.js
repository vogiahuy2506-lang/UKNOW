import { describe, expect, it, jest } from '@jest/globals';
import { run } from '../../../../scripts/reembedBusinessProfiles.js';

// Ba chủ shop: 1 có sản phẩm bán + thiếu chunk, 2 có chunk rồi, 3 chỉ có sản phẩm ngừng bán.
function makeDeps({ chunkOwners = [2] } = {}) {
  const chunks = new Set(chunkOwners);
  const db = {
    query: jest.fn(async (sql, params) => {
      if (/FROM products/.test(sql)) return { rows: [{ owner_id: 1 }, { owner_id: 2 }, { owner_id: 3 }] };
      if (/business_profile_chunks/.test(sql)) return { rows: chunks.has(params[0]) ? [{ '?column?': 1 }] : [] };
      throw new Error(`SQL lạ: ${sql}`);
    }),
  };
  const productRepository = {
    findAllByUser: jest.fn(async (id, opts) => {
      expect(opts).toEqual({ activeOnly: true });
      return id === 3 ? [] : [{ id: id * 10, product_name: 'SP' }];
    }),
  };
  const businessProfileService = {
    reembedChunks: jest.fn(async (id) => { chunks.add(id); }),
  };
  return { db, productRepository, businessProfileService, log: jest.fn() };
}

describe('scripts/reembedBusinessProfiles', () => {
  it('chế độ liệt kê: không gọi reembed', async () => {
    const deps = makeDeps();
    const res = await run({ apply: false, ...deps });
    expect(deps.businessProfileService.reembedChunks).not.toHaveBeenCalled();
    expect(res).toEqual({ before: 1, stale: 0, after: null, reembedded: [] });
  });

  it('--apply: reembed đúng người thiếu chunk (không đụng người đã có / chỉ có sản phẩm ngừng bán)', async () => {
    const deps = makeDeps();
    const res = await run({ apply: true, ...deps });
    expect(deps.businessProfileService.reembedChunks).toHaveBeenCalledTimes(1);
    expect(deps.businessProfileService.reembedChunks).toHaveBeenCalledWith(1);
    expect(res).toEqual({ before: 1, stale: 0, after: 0, reembedded: [1] });
  });
});

// EXTRA-C3 — chunk RAG sản phẩm LỖI THỜI (còn sản phẩm đã ngừng bán / đã xoá) mà bản cũ của script không thấy.
describe('scripts/reembedBusinessProfiles — chunk sản phẩm lỗi thời (EXTRA-C3)', () => {
  const chunkText = (rows) => (rows.length ? `Sản phẩm / Dịch vụ:\n${rows.map((r, i) => `${i + 1}. ${r.product_name}`).join('\n')}` : '');
  // Năm chủ shop:
  //  1: có SP bán, CHƯA có chunk                              → thiếu
  //  2: có SP bán, chunk khớp                                  → ổn
  //  3: chỉ còn SP ngừng bán, chunk cũ còn tên SP ngừng bán    → lỗi thời (reembed sẽ xoá chunk)
  //  4: có SP bán, chunk còn thêm SP đã ngừng bán              → lỗi thời
  //  5: có SP bán, chunk khớp nhưng bị nhân đôi (2 chunk)      → lỗi thời
  const ACTIVE = { 1: [{ product_name: 'A' }], 2: [{ product_name: 'B' }], 3: [], 4: [{ product_name: 'D' }], 5: [{ product_name: 'E' }] };
  function makeStaleDeps() {
    const chunks = new Map([
      [2, [chunkText(ACTIVE[2])]],
      [3, ['Sản phẩm / Dịch vụ:\n1. Khoá đã ngừng bán']],
      [4, ['Sản phẩm / Dịch vụ:\n1. D\n2. Khoá đã ngừng bán']],
      [5, [chunkText(ACTIVE[5]), chunkText(ACTIVE[5])]],
    ]);
    const db = {
      query: jest.fn(async (sql, params) => {
        if (/SELECT DISTINCT owner_id FROM \(/.test(sql)) return { rows: [1, 2, 3, 4, 5].map((owner_id) => ({ owner_id })) };
        if (/FROM products/.test(sql)) return { rows: [1, 2, 3, 4, 5].map((owner_id) => ({ owner_id })) };
        if (/SELECT chunk_text FROM business_profile_chunks/.test(sql)) return { rows: (chunks.get(params[0]) || []).map((chunk_text) => ({ chunk_text })) };
        if (/SELECT 1 FROM business_profile_chunks/.test(sql)) return { rows: (chunks.get(params[0]) || []).length ? [{ '?column?': 1 }] : [] };
        throw new Error(`SQL lạ: ${sql}`);
      }),
    };
    const productRepository = { findAllByUser: jest.fn(async (id) => ACTIVE[id]) };
    const businessProfileService = {
      // Thật: dựng lại từ sản phẩm đang bán, xoá chunk cũ — chủ không còn SP bán thì không còn chunk.
      reembedChunks: jest.fn(async (id) => {
        if (ACTIVE[id].length) chunks.set(id, [chunkText(ACTIVE[id])]);
        else chunks.delete(id);
      }),
    };
    return { db, productRepository, businessProfileService, buildProductsChunkText: chunkText, log: jest.fn() };
  }

  it('dry-run: liệt kê cả nhóm thiếu (1) lẫn nhóm lỗi thời (3, 4, 5); không ghi gì', async () => {
    const deps = makeStaleDeps();
    const res = await run({ apply: false, ...deps });

    expect(res).toEqual({ before: 1, stale: 3, after: null, reembedded: [] });
    expect(deps.businessProfileService.reembedChunks).not.toHaveBeenCalled();
    const lines = deps.log.mock.calls.map(([line]) => line).join('\n');
    expect(lines).toContain('thiếu chunk products (trước): 1 — 1');
    expect(lines).toContain('LỖI THỜI (trước): 3 — 3, 4, 5');
  });

  it('--apply: embed lại đúng nhóm thiếu + lỗi thời (không đụng chủ 2 đã khớp), sau đó không còn gì sai', async () => {
    const deps = makeStaleDeps();
    const res = await run({ apply: true, ...deps });

    expect(deps.businessProfileService.reembedChunks.mock.calls.map(([id]) => id)).toEqual([1, 3, 4, 5]);
    expect(res).toEqual({ before: 1, stale: 3, after: 0, reembedded: [1, 3, 4, 5] });
  });

  it('chunk khớp danh sách đang bán → KHÔNG bị coi là lỗi thời (không báo động giả)', async () => {
    const deps = makeStaleDeps();
    const { findOwnersWithStaleProductChunks } = await import('../../../../scripts/reembedBusinessProfiles.js');
    const stale = await findOwnersWithStaleProductChunks(deps);
    expect(stale).not.toContain(2);
    expect(stale).not.toContain(1); // chưa có chunk = nhóm "thiếu", không phải "lỗi thời"
  });
});
