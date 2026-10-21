import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const { buildLeadWhere } = await import('../lead.repository.js');

describe('buildLeadWhere — phạm vi workspace (PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-3)', () => {
  it('có workspaceOwnerId -> lọc theo chủ và bind tham số', () => {
    const { whereClause, params } = buildLeadWhere({ workspaceOwnerId: 42 });
    expect(whereClause).toContain('COALESCE(workspace_owner_id, id_user) = $1');
    expect(params).toEqual([42]);
    expect(whereClause).not.toMatch(/\bFALSE\b/);
  });

  it.each([
    ['không truyền', {}],
    ['null', { workspaceOwnerId: null }],
    ['undefined', { workspaceOwnerId: undefined }],
    ['rỗng', { workspaceOwnerId: '' }],
    ['0', { workspaceOwnerId: 0 }],
  ])('thiếu workspaceOwnerId (%s) -> fail-closed: điều kiện FALSE, không bao giờ để trống mệnh đề WHERE', (_label, filters) => {
    const { whereClause, params } = buildLeadWhere(filters);
    expect(whereClause).toMatch(/^WHERE .*\bFALSE\b/);
    expect(params).toEqual([]);
  });

  it('bộ lọc khác vẫn đi kèm điều kiện FALSE khi thiếu phạm vi (không "lọt" lead nhờ bộ lọc ngày/slug)', () => {
    const { whereClause } = buildLeadWhere({ useDateRange: true, dateFrom: '2026-09-01', landingSlugs: ['a'] });
    expect(whereClause).toContain('FALSE');
    expect(whereClause).toContain('created_at >= $1::timestamptz');
  });
});
