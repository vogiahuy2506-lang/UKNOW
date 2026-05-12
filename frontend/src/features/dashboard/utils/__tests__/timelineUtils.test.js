import { describe, it, expect } from 'vitest';
import { aggregateToMonthly, formatMonthAxis, formatMonthTooltip } from '../timelineUtils';

describe('aggregateToMonthly', () => {
  it('empty/null → []', () => {
    expect(aggregateToMonthly([])).toEqual([]);
    expect(aggregateToMonthly(null)).toEqual([]);
    expect(aggregateToMonthly(undefined)).toEqual([]);
  });

  it('1 ngày → 1 month bucket, giữ nguyên giá trị', () => {
    const result = aggregateToMonthly([{ date: '2026-03-15', sent: 10, opened: 3 }]);
    expect(result).toEqual([{ date: '2026-03', sent: 10, opened: 3 }]);
  });

  it('nhiều ngày cùng tháng → sum metrics', () => {
    const result = aggregateToMonthly([
      { date: '2026-03-01', sent: 10, opened: 2 },
      { date: '2026-03-15', sent: 20, opened: 5 },
      { date: '2026-03-31', sent: 30, opened: 8 },
    ]);
    expect(result).toEqual([{ date: '2026-03', sent: 60, opened: 15 }]);
  });

  it('nhiều tháng → sort ascending theo date YYYY-MM', () => {
    const result = aggregateToMonthly([
      { date: '2026-05-01', sent: 5 },
      { date: '2026-01-15', sent: 1 },
      { date: '2026-03-10', sent: 3 },
    ]);
    expect(result.map((r) => r.date)).toEqual(['2026-01', '2026-03', '2026-05']);
    expect(result.map((r) => r.sent)).toEqual([1, 3, 5]);
  });

  it('numeric keys được auto-discover từ item đầu tiên', () => {
    const result = aggregateToMonthly([
      { date: '2026-01-01', a: 1, b: 2 },
      { date: '2026-01-02', a: 3, b: 4 },
    ]);
    expect(result[0]).toEqual({ date: '2026-01', a: 4, b: 6 });
  });

  it('giá trị undefined/null → coi như 0', () => {
    const result = aggregateToMonthly([
      { date: '2026-01-01', sent: 10 },
      { date: '2026-01-02', sent: undefined },
      { date: '2026-01-03', sent: null },
    ]);
    expect(result[0].sent).toBe(10);
  });
});

describe('formatMonthAxis', () => {
  it('"2026-03" → "3-2026"', () => {
    expect(formatMonthAxis('2026-03')).toBe('3-2026');
  });

  it('strip leading zero của tháng', () => {
    expect(formatMonthAxis('2026-01')).toBe('1-2026');
    expect(formatMonthAxis('2025-12')).toBe('12-2025');
  });
});

describe('formatMonthTooltip', () => {
  it('"2026-03" → "Tháng 3/2026"', () => {
    expect(formatMonthTooltip('2026-03')).toBe('Tháng 3/2026');
  });

  it('"2026-12" → "Tháng 12/2026"', () => {
    expect(formatMonthTooltip('2026-12')).toBe('Tháng 12/2026');
  });
});
