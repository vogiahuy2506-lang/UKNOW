import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 (C2-04) — biên ngày của thống kê landing / lead / form phải là NGÀY VIỆT NAM.
 *
 * Trước đây ghép `…T00:00:00.000Z` / `…T23:59:59.999Z` (UTC): ngày VN [00:00, 24:00) =
 * [17:00Z hôm trước, 17:00Z] nên mất 7 giờ đầu ngày bắt đầu và thừa 7 giờ đầu ngày kế tiếp.
 * Phép kiểm ở ranh giới bind-parameter: đây là chỗ giá trị đi vào SQL (`$n::timestamptz`).
 */
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const leadRepository = (await import('../lead.repository.js')).default;
const landingPageEventRepository = (await import('../landingPageEvent.repository.js')).default;
const formRepository = (await import('../form.repository.js')).default;

const FROM_VN = '2026-09-01T00:00:00.000+07:00';
const TO_VN = '2026-09-30T23:59:59.999+07:00';

const lastCall = () => mockQuery.mock.calls.at(-1);

describe('biên ngày VN của thống kê landing/lead/form (C2-04)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [{ c: 0 }] });
  });

  it('lead.countFiltered (bộ lọc ngày của /app/landing-leads): bind mốc +07:00', async () => {
    await leadRepository.countFiltered({
      useDateRange: true,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
    const [sql, params] = lastCall();
    expect(sql).toContain('created_at >= $1::timestamptz');
    expect(sql).toContain('created_at <= $2::timestamptz');
    expect(params.slice(0, 2)).toEqual([FROM_VN, TO_VN]);
  });

  it('lead.aggregateSubmitsBySlug (Dashboard landing): bind mốc +07:00', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await leadRepository.aggregateSubmitsBySlug('2026-09-01', '2026-09-30', { isSuperAdmin: true });
    expect(lastCall()[1]).toEqual([FROM_VN, TO_VN]);
  });

  it('landingPageEvent.aggregateEventsBySlug (lượt xem/click): bind mốc +07:00', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await landingPageEventRepository.aggregateEventsBySlug('2026-09-01', '2026-09-30', { isSuperAdmin: true });
    expect(lastCall()[1]).toEqual([FROM_VN, TO_VN]);
  });

  it('form.aggregateSubmitsBySlug (bài nộp biểu mẫu): bind mốc +07:00', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await formRepository.aggregateSubmitsBySlug('2026-09-01', '2026-09-30', { isSuperAdmin: true });
    expect(lastCall()[1]).toEqual([FROM_VN, TO_VN]);
  });
});
