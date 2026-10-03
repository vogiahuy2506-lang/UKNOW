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
    expect(res).toEqual({ before: 1, after: null, reembedded: [] });
  });

  it('--apply: reembed đúng người thiếu chunk (không đụng người đã có / chỉ có sản phẩm ngừng bán)', async () => {
    const deps = makeDeps();
    const res = await run({ apply: true, ...deps });
    expect(deps.businessProfileService.reembedChunks).toHaveBeenCalledTimes(1);
    expect(deps.businessProfileService.reembedChunks).toHaveBeenCalledWith(1);
    expect(res).toEqual({ before: 1, after: 0, reembedded: [1] });
  });
});
