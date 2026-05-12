import { describe, it, expect, vi } from 'vitest';
import { fetchAllTemplateListPages } from '../fetchAllTemplateListPages';

const makeResp = (items, pagination) => ({ data: { data: { items, pagination } } });

describe('fetchAllTemplateListPages', () => {
  it('1 trang — trả items, mặc định limit=200', async () => {
    const apiGet = vi.fn().mockResolvedValueOnce(
      makeResp([{ id: 1 }, { id: 2 }], { totalPages: 1 })
    );
    const out = await fetchAllTemplateListPages(apiGet);
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith({ page: 1, limit: 200 });
  });

  it('nhiều trang — gọi tuần tự + gộp items', async () => {
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce(makeResp([{ id: 1 }, { id: 2 }], { totalPages: 3 }))
      .mockResolvedValueOnce(makeResp([{ id: 3 }, { id: 4 }], { totalPages: 3 }))
      .mockResolvedValueOnce(makeResp([{ id: 5 }], { totalPages: 3 }));
    const out = await fetchAllTemplateListPages(apiGet);
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
    expect(apiGet).toHaveBeenNthCalledWith(1, { page: 1, limit: 200 });
    expect(apiGet).toHaveBeenNthCalledWith(2, { page: 2, limit: 200 });
    expect(apiGet).toHaveBeenNthCalledWith(3, { page: 3, limit: 200 });
  });

  it('perPage tùy chỉnh', async () => {
    const apiGet = vi.fn().mockResolvedValueOnce(makeResp([{ id: 1 }], { totalPages: 1 }));
    await fetchAllTemplateListPages(apiGet, { perPage: 50 });
    expect(apiGet).toHaveBeenCalledWith({ page: 1, limit: 50 });
  });

  it('không có pagination → coi như 1 trang', async () => {
    const apiGet = vi.fn().mockResolvedValueOnce(makeResp([{ id: 1 }], undefined));
    const out = await fetchAllTemplateListPages(apiGet);
    expect(out).toEqual([{ id: 1 }]);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('items không phải mảng → bỏ qua nhưng vẫn loop theo totalPages', async () => {
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce(makeResp(null, { totalPages: 2 }))
      .mockResolvedValueOnce(makeResp([{ id: 9 }], { totalPages: 2 }));
    const out = await fetchAllTemplateListPages(apiGet);
    expect(out).toEqual([{ id: 9 }]);
  });

  it('totalPages = 0 hoặc âm → coi như 1 trang', async () => {
    const apiGet = vi.fn().mockResolvedValueOnce(makeResp([{ id: 1 }], { totalPages: 0 }));
    const out = await fetchAllTemplateListPages(apiGet);
    expect(out).toEqual([{ id: 1 }]);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
