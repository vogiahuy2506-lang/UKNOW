import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 (C-09) — `/app/customers` lọc bỏ nháp ở trình duyệt SAU khi API đã cắt 20 dòng/trang rồi gán
 * `total = số dòng còn lại` → luôn 1 trang, chiến dịch thứ 21 trở đi không mở được. Sửa: lọc trong SQL
 * (cả truy vấn lấy trang lẫn truy vấn đếm) để `pagination.total` là số thật.
 */
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { default: campaignCrudRepository, buildCampaignFilterSql } = await import('../campaignCrud.repository.js');

describe('campaignCrud — excludeDraft (C-09)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('buildCampaignFilterSql: excludeDraft=true thêm điều kiện status <> draft, không thêm tham số', () => {
    const params = [];
    const sql = buildCampaignFilterSql({ excludeDraft: true }, params, 'c');
    expect(sql).toContain("c.status <> 'draft'");
    expect(params).toEqual([]);
  });

  it('buildCampaignFilterSql: không truyền excludeDraft thì KHÔNG lọc nháp', () => {
    expect(buildCampaignFilterSql({}, [], 'c')).not.toContain("<> 'draft'");
    expect(buildCampaignFilterSql({ excludeDraft: false }, [], 'c')).not.toContain("<> 'draft'");
  });

  it('findCampaigns + countCampaigns đều lọc nháp trong SQL (trang và tổng cùng một điều kiện)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await campaignCrudRepository.findCampaigns({
      userId: 7, workspaceOwnerId: 7, isAdmin: false, excludeDraft: true, limit: 20, offset: 0,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    await campaignCrudRepository.countCampaigns({
      userId: 7, workspaceOwnerId: 7, isAdmin: false, excludeDraft: true,
    });
    const [findSql] = mockQuery.mock.calls[0];
    const [countSql] = mockQuery.mock.calls[1];
    expect(findSql).toContain("c.status <> 'draft'");
    expect(countSql).toContain("c.status <> 'draft'");
  });
});
