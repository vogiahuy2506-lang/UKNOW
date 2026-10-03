import { describe, expect, it } from 'vitest';
import { dashboardFiltersMatch, pickTopActions, summarizeOverview } from '../dashboardInsightSummary.util';

describe('summarizeOverview', () => {
  it('giữ tối đa 3 câu đầu, gộp xuống dòng', () => {
    expect(summarizeOverview('A một.\nB hai! C ba? D bốn.')).toBe('A một. B hai! C ba?');
  });
  it('ít hơn 3 câu thì giữ nguyên; không phải chuỗi → rỗng', () => {
    expect(summarizeOverview('Chỉ một câu không dấu chấm')).toBe('Chỉ một câu không dấu chấm');
    expect(summarizeOverview(null)).toBe('');
    expect(summarizeOverview('   ')).toBe('');
  });
  it('số thập phân không bị cắt giữa câu', () => {
    expect(summarizeOverview('Tỉ lệ mở 37.5% là ổn. Câu hai.')).toBe('Tỉ lệ mở 37.5% là ổn. Câu hai.');
  });
});

describe('pickTopActions', () => {
  it('lấy tối đa 3 việc từ action_plan đúng thứ tự, bỏ mục rỗng', () => {
    const insights = { action_plan: [{ action: 'A' }, { action: '  ' }, { action: 'B' }, 'C', { action: 'D' }] };
    expect(pickTopActions(insights)).toEqual(['A', 'B', 'C']);
  });
  it('không có action_plan → mảng rỗng', () => {
    expect(pickTopActions({})).toEqual([]);
    expect(pickTopActions(null)).toEqual([]);
  });
});

describe('dashboardFiltersMatch', () => {
  const base = { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] };
  it('trùng khi cùng ngày / kênh / tập chiến dịch (không phân biệt thứ tự và kiểu số)', () => {
    expect(dashboardFiltersMatch(base, { ...base })).toBe(true);
    expect(dashboardFiltersMatch({ ...base, campaignIds: [2, 1] }, { ...base, campaignIds: ['1', '2'] })).toBe(true);
    expect(dashboardFiltersMatch({ ...base, campaignType: undefined }, base)).toBe(true);
  });
  it('lệch ngày / kênh / chiến dịch hoặc thiếu bản ghi → không trùng', () => {
    expect(dashboardFiltersMatch(base, { ...base, endDate: '2026-10-01' })).toBe(false);
    expect(dashboardFiltersMatch(base, { ...base, startDate: '2026-08-01' })).toBe(false);
    expect(dashboardFiltersMatch(base, { ...base, campaignType: 'zalo_group' })).toBe(false);
    expect(dashboardFiltersMatch(base, { ...base, campaignIds: [1] })).toBe(false);
    expect(dashboardFiltersMatch(null, base)).toBe(false);
    expect(dashboardFiltersMatch(base, undefined)).toBe(false);
  });
});
