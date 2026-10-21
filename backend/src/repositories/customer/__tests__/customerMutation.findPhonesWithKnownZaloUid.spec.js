import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-4 Việc 4.1 — `findPhonesWithKnownZaloUid(userId, phones)`: tra uid hàng loạt bằng MỘT truy vấn.
 * Unit mock `db.query` đúng hình dạng thật ({ rows: [{ phone_key }] }); điều kiện khớp phone/zalo_phone, bỏ zalo_id rỗng,
 * đúng workspace nằm trong SQL nên được kiểm bằng CSDL thật ở tests/integration/customerKnownZaloUidBatch.test.js.
 */
const mockQuery = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
  withRetry: (fn) => fn(),
  isConnectionError: () => false,
  isNeon: false,
}));

const { default: customerMutationRepository } = await import('../customerMutation.repository.js');

describe('customerMutation.repository — findPhonesWithKnownZaloUid', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('danh sách rỗng / toàn rỗng → Set rỗng, KHÔNG chạm CSDL', async () => {
    expect(await customerMutationRepository.findPhonesWithKnownZaloUid(10, [])).toEqual(new Set());
    expect(await customerMutationRepository.findPhonesWithKnownZaloUid(10, ['', '  ', null])).toEqual(new Set());
    expect(await customerMutationRepository.findPhonesWithKnownZaloUid(10, undefined)).toEqual(new Set());
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('MỘT truy vấn cho cả danh sách: tham số = [userId, mảng số đã trim + khử trùng], trả Set các số khớp', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone_key: '0901' }, { phone_key: ' 0902 ' }, { phone_key: null }] });

    const result = await customerMutationRepository.findPhonesWithKnownZaloUid(10, ['0901', ' 0902', '0903', '0901']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([10, ['0901', '0902', '0903']]);
    expect(sql).toContain('= ANY($2::text[])');
    // Cùng điều kiện với findKnownZaloUidByPhone: workspace, khớp phone HOẶC zalo_phone, zalo_id khác rỗng.
    expect(sql).toContain('COALESCE(c.workspace_owner_id, c.id_user) = $1');
    expect(sql).toContain('c.phone = ANY');
    expect(sql).toContain('c.zalo_phone = ANY');
    expect(sql).toContain("c.zalo_id <> ''");
    expect(sql).toContain('c.zalo_id IS NOT NULL');
    expect(result).toEqual(new Set(['0901', '0902']));
    expect(result).toBeInstanceOf(Set);
  });
});
