import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_LAM_GON_TRANG_BAO_CAO 04/10/2026: bản phân tích đã lưu TRƯỚC mốc đổi cách tính (PR-5, 30/09/2026 19:21 giờ VN)
 * không trả cho UI (production có bản 05/04/2026 chứa câu "không nhất quán 182 gửi vs 98 gửi" đã sai thời đó);
 * bản sau mốc trả kèm `filtersSnapshot` để client so với bộ lọc đang xem.
 */
const findLatestByUser = jest.fn();
jest.unstable_mockModule('../../../repositories/dashboard/dashboardInsight.repository.js', () => ({
  default: { findLatestByUser, replaceForUser: jest.fn() },
}));

const { default: service, SAVED_INSIGHT_MIN_CREATED_AT } = await import('../dashboardInsights.service.js');

const FILTERS = { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] };

describe('getSavedInsightForUser — mốc đổi cách tính + bộ lọc kèm theo', () => {
  beforeEach(() => {
    findLatestByUser.mockReset();
  });

  it('mốc là 30/09/2026 19:21 giờ VN (12:21Z)', () => {
    expect(SAVED_INSIGHT_MIN_CREATED_AT.toISOString()).toBe('2026-09-30T12:21:00.000Z');
  });

  it('chưa có bản lưu → null', async () => {
    findLatestByUser.mockResolvedValue(null);
    expect(await service.getSavedInsightForUser(1)).toBeNull();
  });

  it('bản lưu 05/04/2026 (trước mốc) → null, không trả payload cũ', async () => {
    findLatestByUser.mockResolvedValue({
      payload: { overview: 'không nhất quán 182 gửi vs 98 gửi' },
      filters_snapshot: { ...FILTERS, campaignType: 'zalo_group' },
      created_at: new Date('2026-04-05T03:00:00.000Z'),
    });
    expect(await service.getSavedInsightForUser(1)).toBeNull();
  });

  it('bản lưu ngay trước mốc (12:20Z) → null; đúng mốc (12:21Z) → trả', async () => {
    findLatestByUser.mockResolvedValue({ payload: { overview: 'x' }, filters_snapshot: FILTERS, created_at: new Date('2026-09-30T12:20:59.000Z') });
    expect(await service.getSavedInsightForUser(1)).toBeNull();
    findLatestByUser.mockResolvedValue({ payload: { overview: 'x' }, filters_snapshot: FILTERS, created_at: new Date('2026-09-30T12:21:00.000Z') });
    expect(await service.getSavedInsightForUser(1)).not.toBeNull();
  });

  it('bản lưu sau mốc → trả savedAt (ISO) + filtersSnapshot + insights', async () => {
    const payload = { overview: 'ổn' };
    findLatestByUser.mockResolvedValue({ payload, filters_snapshot: FILTERS, created_at: new Date('2026-10-02T03:00:00.000Z') });
    expect(await service.getSavedInsightForUser(1)).toEqual({
      savedAt: '2026-10-02T03:00:00.000Z',
      filtersSnapshot: FILTERS,
      insights: payload,
    });
  });

  it('bản lưu không có filters_snapshot → filtersSnapshot null (client sẽ không hiện)', async () => {
    findLatestByUser.mockResolvedValue({ payload: { overview: 'ổn' }, filters_snapshot: null, created_at: new Date('2026-10-02T03:00:00.000Z') });
    expect((await service.getSavedInsightForUser(1)).filtersSnapshot).toBeNull();
  });

  it('userId không hợp lệ → null, không đụng DB', async () => {
    expect(await service.getSavedInsightForUser('abc')).toBeNull();
    expect(findLatestByUser).not.toHaveBeenCalled();
  });
});
