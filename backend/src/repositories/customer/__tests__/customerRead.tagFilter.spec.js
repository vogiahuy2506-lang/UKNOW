/**
 * PR-T3: điều kiện SQL lọc tag dùng CHUNG (`buildTagFilterSql`) — danh sách khách, đếm của trình từng bước, khối `interested_customers`.
 * Kiểm hình dạng SQL và thứ tự tham số (SQL thật chạy ở integration `campaignAudienceByTag.test.js`).
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: jest.fn() } }));

const { buildTagFilterSql, default: repo } = await import('../customerRead.repository.js');

describe('buildTagFilterSql', () => {
  it('không chọn tag -> không thêm điều kiện, không đụng tham số', () => {
    const params = [5];
    expect(buildTagFilterSql(undefined, params)).toBe('');
    expect(buildTagFilterSql([], params)).toBe('');
    expect(params).toEqual([5]);
  });

  it('khách mang BẤT KỲ tag (ANY, không phải AND/ALL) và tag phải thuộc workspace $1', () => {
    const params = [5];
    const sql = buildTagFilterSql([4, 9], params);
    expect(params).toEqual([5, [4, 9]]);
    expect(sql).toContain('cta.tag_id = ANY($2::bigint[])');
    expect(sql).toContain('ctg.workspace_owner_id = $1');
    expect(sql).toContain('cta.customer_id = c.id');
    expect(sql).not.toMatch(/\bALL\s*\(/i);
  });

  it('chỉ số tham số theo vị trí thật trong mảng (sau các tham số có sẵn)', () => {
    const params = [5, 'a', 'b'];
    expect(buildTagFilterSql([1], params)).toContain('ANY($4::bigint[])');
  });
});

describe('buildCustomerListFilter dùng cùng điều kiện', () => {
  it('tagIds đi qua bộ lọc chung: tham số cuối là mảng tag, workspace là $1', () => {
    const { whereSql, params } = repo.buildCustomerListFilter({ userId: 5, tagIds: [4] });
    expect(params).toEqual([5, [4]]);
    expect(whereSql).toContain('ctg.workspace_owner_id = $1');
    expect(whereSql).toContain('ANY($2::bigint[])');
  });

  it('không tagIds -> không có điều kiện tag', () => {
    const { whereSql } = repo.buildCustomerListFilter({ userId: 5 });
    expect(whereSql).not.toContain('customer_tag_assignments');
  });
});
