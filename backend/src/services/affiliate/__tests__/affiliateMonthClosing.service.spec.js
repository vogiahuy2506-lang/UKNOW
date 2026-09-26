import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery, getClient: mockGetClient },
}));

const {
  closeAffiliateMonth,
  closeAffiliateMonthsCatchup,
  subtractMonthsFromKey,
  AFFILIATE_MONTH_CLOSING_CATCHUP_MONTHS,
} = await import('../affiliateMonthClosing.service.js');

function makeClient(queryImpl) {
  return { query: jest.fn(queryImpl), release: jest.fn() };
}

describe('subtractMonthsFromKey — số học nguyên, không dùng Date/timezone', () => {
  it('trừ trong cùng năm', () => {
    expect(subtractMonthsFromKey('2026-09', 1)).toBe('2026-08');
    expect(subtractMonthsFromKey('2026-09', 6)).toBe('2026-03');
  });

  it('trừ vắt qua năm trước', () => {
    expect(subtractMonthsFromKey('2026-01', 1)).toBe('2025-12');
    expect(subtractMonthsFromKey('2026-01', 13)).toBe('2024-12');
  });

  it('trừ 0 trả lại chính tháng đó', () => {
    expect(subtractMonthsFromKey('2026-09', 0)).toBe('2026-09');
  });
});

describe('closeAffiliateMonth — Việc 6.3: một referrer lỗi không chặn người khác', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('referrer đầu throw ở bước tính gross, referrer sau vẫn được xử lý và commit', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ referrer_user_id: 1 }, { referrer_user_id: 2 }],
    });

    const clientA = makeClient();
    clientA.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('DB tạm gián đoạn')) // gross SELECT throws
      .mockResolvedValueOnce({}); // ROLLBACK

    const clientB = makeClient();
    clientB.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ current_gross: '5000000' }] }) // gross SELECT
      .mockResolvedValueOnce({ rows: [{ id: 9, gross_revenue: '5000000', tier_level: 1, rate_percent: 10, commission_amount: '500000' }] }) // existingPeriodRows — gross không đổi
      .mockResolvedValueOnce({}); // COMMIT

    mockGetClient.mockResolvedValueOnce(clientA).mockResolvedValueOnce(clientB);

    const result = await closeAffiliateMonth('2026-09', { force: true });

    expect(result.erroredReferrers).toBe(1);
    expect(result.processedReferrers).toBe(1);
    expect(clientA.query).toHaveBeenCalledWith('ROLLBACK');
    expect(clientB.query).toHaveBeenCalledWith('COMMIT');
  });

  it('không throw ra ngoài dù referrer lỗi (trước đây throw làm hỏng cả vòng for)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ referrer_user_id: 1 }] });
    const clientA = makeClient();
    clientA.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});
    mockGetClient.mockResolvedValueOnce(clientA);

    await expect(closeAffiliateMonth('2026-09', { force: true })).resolves.toEqual(
      expect.objectContaining({ erroredReferrers: 1, processedReferrers: 0 })
    );
  });
});

describe('closeAffiliateMonth — đối soát event muộn: delta âm chỉ log, không throw, không ghi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gross tăng nhưng commission mới < commission cũ (delta âm) — log lỗi, KHÔNG insert ledger, KHÔNG update period', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ referrer_user_id: 1 }] });
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ current_gross: '15000000' }] }) // gross SELECT -> tier 2 (15%) = 2.250.000
      .mockResolvedValueOnce({ rows: [{ id: 7, gross_revenue: '5000000', tier_level: 1, rate_percent: 10, commission_amount: '9999999' }] }) // prevCommission giả định bất thường cao hơn
      .mockResolvedValueOnce({}); // COMMIT
    mockGetClient.mockResolvedValueOnce(client);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await closeAffiliateMonth('2026-09', { force: true });
    consoleErrorSpy.mockRestore();

    expect(result.adjustedPeriods).toBe(0);
    expect(result.totalAdjustment).toBe(0);
    expect(result.erroredReferrers).toBe(0);
    // Chỉ 4 lệnh: BEGIN, gross SELECT, existingPeriod SELECT, COMMIT — không có INSERT/UPDATE nào chen vào.
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query).toHaveBeenNthCalledWith(4, 'COMMIT');
  });
});

describe('closeAffiliateMonthsCatchup — Việc 6.1: chạy lại tháng cũ, một tháng lỗi không chặn tháng khác', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gọi đúng previousMonth + N tháng cũ, gộp kết quả, tháng lỗi không chặn các tháng khác', async () => {
    const referenceDate = new Date('2026-10-15T04:00:00.000Z'); // giờ VN 11:00 15/10 -> tháng trước = 2026-09

    mockDbQuery.mockImplementation(async (sql, params) => {
      const monthKey = params?.[0];
      if (monthKey === '2026-09') {
        return { rows: [{ referrer_user_id: 10 }] };
      }
      if (monthKey === '2026-06') {
        throw new Error('Mất kết nối DB tạm thời khi quét tháng 2026-06');
      }
      return { rows: [] };
    });

    const clientReferrer10 = makeClient();
    clientReferrer10.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ current_gross: '1000000' }] }) // gross SELECT -> tier 1 (10%) = 100.000
      .mockResolvedValueOnce({ rows: [] }) // existingPeriodRows rỗng -> insert
      .mockResolvedValueOnce({ rows: [{ id: 5, commission_amount: 100000 }] }) // INSERT period RETURNING
      .mockResolvedValueOnce({}) // INSERT ledger
      .mockResolvedValueOnce({}); // COMMIT
    mockGetClient.mockResolvedValueOnce(clientReferrer10);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await closeAffiliateMonthsCatchup({ referenceDate, force: true });
    consoleErrorSpy.mockRestore();

    expect(summary.monthKeys).toEqual([
      '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03',
    ]);
    expect(summary.monthKeys).toHaveLength(AFFILIATE_MONTH_CLOSING_CATCHUP_MONTHS + 1);
    expect(summary.status).toBe('success');
    expect(summary.insertedPeriods).toBe(1);
    expect(summary.totalCommission).toBe(100000);

    // Tháng 2026-06 lỗi toàn bộ (không chỉ 1 referrer) vẫn phải có mặt trong results, không được
    // làm mất kết quả của các tháng khác.
    const juneResult = summary.results.find((r) => r.monthKey === '2026-06');
    expect(juneResult).toEqual(expect.objectContaining({ status: 'error' }));

    const septResult = summary.results.find((r) => r.monthKey === '2026-09');
    expect(septResult).toEqual(expect.objectContaining({ status: 'success', insertedPeriods: 1 }));
  });

  it('dùng catchupMonths tuỳ chỉnh', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });
    const referenceDate = new Date('2026-10-15T04:00:00.000Z');

    const summary = await closeAffiliateMonthsCatchup({ referenceDate, catchupMonths: 2, force: true });

    expect(summary.monthKeys).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(summary.status).toBe('noop');
  });
});
