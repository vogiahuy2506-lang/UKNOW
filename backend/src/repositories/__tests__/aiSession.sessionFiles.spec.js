import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { listUserFilesSinceLastLanding } = await import('../aiSession.repository.js');

describe('listUserFilesSinceLastLanding — B-17: tệp gom từ phiên mang cờ fromSession', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('mọi tệp trả về có fromSession=true (chỉ tệp đã promote vào uploads/<chủ>/chat/, bỏ trùng khoá)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            files: [
              { storage_key: 'uploads/7/chat/a.png', originalName: 'a.png', contentType: 'image/png', size: 10 },
              { storage_key: 'uploads/7/chat/a.png', originalName: 'a-trung.png' },
              { storage_key: 'uploads/999/chat/khac-chu.png', originalName: 'x.png' },
              { storageKey: 'uploads/7/chat/b.pdf', displayName: 'b.pdf' },
            ],
          },
        ],
      });
    const files = await listUserFilesSinceLastLanding(5, 3, 7);
    expect(files).toEqual([
      { storageKey: 'uploads/7/chat/a.png', originalName: 'a.png', contentType: 'image/png', size: 10, fromSession: true },
      { storageKey: 'uploads/7/chat/b.pdf', originalName: 'b.pdf', contentType: '', size: 0, fromSession: true },
    ]);
  });

  it('phiên không thuộc người dùng → mảng rỗng', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(listUserFilesSinceLastLanding(5, 3, 7)).resolves.toEqual([]);
  });
});
