/**
 * Hai bộ đọc "lượt AI đã dùng" phía admin phải loại dòng bán Marketplace
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-2) — ghim CHUỖI SQL; phép cộng thật ở
 * tests/integration/aiCreditUsedPerCycle.test.js.
 *
 *   - aiUsage.repository.listCreditCustomers: tập khách "có dùng" trong 31 ngày (chỉ dòng bán → KHÔNG tính là có dùng).
 *
 * (Cột "% AI" của trang Thành viên đã bị bỏ ở PR-9 — số đó nằm ở trang AI — nên phần test findAllMembers ở đây cũng bỏ.)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = { query: jest.fn(), getClient: jest.fn() };

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

const aiUsageRepository = (await import('../aiUsage.repository.js')).default;

const SALE_EXCLUSION_UL = "COALESCE(ul.metadata->>'type', '') <> 'marketplace_sale'";
const sqlOf = (call) => String(call[0]).replace(/\s+/g, ' ');

describe('aiUsage.repository.listCreditCustomers', () => {
  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [{ user_id: '39', plan_id: 1 }] });
  });

  it('chi lay ai_credit, loai marketplace_sale, JOIN goi dang dung, cua so 31 ngay truyen qua tham so', async () => {
    const rows = await aiUsageRepository.listCreditCustomers({ lookbackDays: 31 });
    expect(rows).toEqual([{ user_id: '39', plan_id: 1 }]);
    const sql = sqlOf(mockDb.query.mock.calls[0]);
    expect(sql).toMatch(/ul\.resource_type = 'ai_credit'/);
    expect(sql).toContain(SALE_EXCLUSION_UL);
    expect(sql).toMatch(/JOIN plans p ON p\.id = u\.active_plan_id/);
    expect(sql).not.toMatch(/LEFT JOIN plans/);
    expect(sql).toMatch(/ul\.created_at >= NOW\(\) - \(\$1::int \* INTERVAL '1 day'\)/);
    expect(mockDb.query.mock.calls[0][1]).toEqual([31]);
    // dòng MUA Marketplace là tiêu thụ thật → điều kiện lọc không được nhắc tới
    expect(sql).not.toMatch(/marketplace_purchase/);
  });

  it('mac dinh 31 ngay', async () => {
    await aiUsageRepository.listCreditCustomers();
    expect(mockDb.query.mock.calls[0][1]).toEqual([31]);
  });
});
