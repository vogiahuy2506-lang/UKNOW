/**
 * Ghim câu SQL "lượt AI đã dùng" (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-2).
 *
 * DB giả không tự kiểm được phép lọc — file này chỉ ghim CHUỖI SQL (chạy nhanh trong bộ unit); phép cộng thật trên
 * Postgres nằm ở tests/integration/aiCreditUsedPerCycle.test.js.
 *
 * Dòng bán Marketplace (`metadata.type = 'marketplace_sale'`) là thu nhập người bán, ghi nhầm vào sổ tiêu thụ trước
 * 4ba3b99b → phải LOẠI. Dòng MUA (`feature = 'marketplace_purchase:<id>'`) là tiêu thụ thật → KHÔNG được loại theo.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query, getClient: jest.fn() },
}));

const usageTrackingRepository = (await import('../usageTracking.repository.js')).default;
const { aiCreditConsumptionRowSql } = await import('../../../constants/aiCreditUsage.js');

const SALE_EXCLUSION = "COALESCE(metadata->>'type', '') <> 'marketplace_sale'";

const sqlOf = (call) => String(call[0]).replace(/\s+/g, ' ');

describe('aiCreditConsumptionRowSql', () => {
  it('khong alias: loai dung dau marketplace_sale, NULL-safe', () => {
    expect(aiCreditConsumptionRowSql()).toBe(SALE_EXCLUSION);
  });

  it('co alias: tien to bang duoc gan vao metadata', () => {
    expect(aiCreditConsumptionRowSql('ul')).toBe("COALESCE(ul.metadata->>'type', '') <> 'marketplace_sale'");
  });

  it('khong loai dong MUA: cau dieu kien khong nhac toi marketplace_purchase, feature hay LIKE', () => {
    const sql = aiCreditConsumptionRowSql('ul');
    expect(sql).not.toMatch(/marketplace_purchase/);
    expect(sql).not.toMatch(/feature/);
    expect(sql).not.toMatch(/LIKE/i);
  });
});

describe('usageTracking.repository - moi bo doc "da dung" deu loai dong ban Marketplace', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ total_usage: '7' }] });
  });

  it('getUsageInRange (ham cua cong chan aiCreditMeter): loai marketplace_sale, giu nguyen tham so', async () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T00:00:00Z');
    const used = await usageTrackingRepository.getUsageInRange(7, 'ai_credit', from, to);

    expect(used).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = sqlOf(query.mock.calls[0]);
    expect(sql).toContain(SALE_EXCLUSION);
    expect(sql).toMatch(/resource_type = \$2/);
    expect(sql).toMatch(/created_at >= \$3 AND created_at <= \$4/);
    expect(query.mock.calls[0][1]).toEqual([7, 'ai_credit', from, to]);
    // không được loại luôn dòng MUA
    expect(sql).not.toMatch(/marketplace_purchase/);
    expect(sql).not.toMatch(/LIKE/i);
  });

  it('getUsageInRange qua client giao dich (consume/deductCredits) van co dieu kien loai', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ total_usage: '3' }] }) };
    await usageTrackingRepository.getUsageInRange(7, 'ai_credit', new Date(0), new Date(), client);
    expect(query).not.toHaveBeenCalled();
    expect(sqlOf(client.query.mock.calls[0])).toContain(SALE_EXCLUSION);
  });

  it('getCurrentUsage (thang duong lich): loai marketplace_sale', async () => {
    await usageTrackingRepository.getCurrentUsage(7, 'ai_credit');
    expect(sqlOf(query.mock.calls[0])).toContain(SALE_EXCLUSION);
  });

  it('getUsageSummary: loai marketplace_sale', async () => {
    await usageTrackingRepository.getUsageSummary(7);
    expect(sqlOf(query.mock.calls[0])).toContain(SALE_EXCLUSION);
  });
});
