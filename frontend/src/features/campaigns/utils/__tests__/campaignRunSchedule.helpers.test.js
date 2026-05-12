import { describe, it, expect } from 'vitest';
import {
  parseCustomIntervalDaysFromCron,
  buildDelayedRunDate,
  buildCronExpression,
  getScheduleTypeLabel,
  isCompletedOnceSchedule,
  isStoppedOnceSchedule,
  isReadonlyOnceSchedule,
  getWeeklyDayLabel,
  getWeeklyDayFromCron,
  getScheduleStatusLabel,
  getScheduleStatusClassName,
  filterSchedulesByCampaignId,
  parseCronMinuteHourFiveField,
  formatScheduleRunClockFromCron,
  isCronExpressionOneTimeRun,
  isScheduleOneTimeRun,
  resolveScheduleNextRunAt,
  resolveOneTimeSchedulePlannedAt,
  resolveScheduleUiTimingDate,
  getScheduleRunTimingFieldLabelVi,
  getSchedulePatternSummaryVi,
} from '../campaignRunSchedule.helpers';

const WEEKLY_DAY_OPTIONS = [
  { value: '0', label: 'Chủ nhật' },
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
];

describe('parseCustomIntervalDaysFromCron', () => {
  it("'0 9 */3 * *' → 3", () => {
    expect(parseCustomIntervalDaysFromCron('0 9 */3 * *')).toBe(3);
  });

  it("'0 9 */15 * *' → 15", () => {
    expect(parseCustomIntervalDaysFromCron('0 9 */15 * *')).toBe(15);
  });

  it('không phải pattern */N → null', () => {
    expect(parseCustomIntervalDaysFromCron('0 9 1 * *')).toBeNull();
    expect(parseCustomIntervalDaysFromCron('0 9 * * *')).toBeNull();
    expect(parseCustomIntervalDaysFromCron('')).toBeNull();
    expect(parseCustomIntervalDaysFromCron('0 9')).toBeNull();
  });

  it("'*/0' → null (không thể chia 0 ngày)", () => {
    expect(parseCustomIntervalDaysFromCron('0 9 */0 * *')).toBeNull();
  });
});

describe('buildDelayedRunDate', () => {
  it('delay 5 phút → Date sau ~5 phút', () => {
    const before = Date.now();
    const out = buildDelayedRunDate(5, 'minutes');
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime() - before).toBeGreaterThanOrEqual(5 * 60 * 1000 - 5);
    expect(out.getTime() - before).toBeLessThan(5 * 60 * 1000 + 1000);
  });

  it('delay 2 giờ → Date sau ~2 giờ', () => {
    const before = Date.now();
    const out = buildDelayedRunDate('2', 'hours');
    expect(out.getTime() - before).toBeGreaterThanOrEqual(2 * 3600 * 1000 - 5);
  });

  it('delay 1 ngày → Date sau ~86_400_000ms', () => {
    const before = Date.now();
    const out = buildDelayedRunDate(1, 'days');
    expect(out.getTime() - before).toBeGreaterThanOrEqual(86_400_000 - 5);
  });

  it('value/unit không hợp lệ → null', () => {
    expect(buildDelayedRunDate(0, 'minutes')).toBeNull();
    expect(buildDelayedRunDate(-1, 'minutes')).toBeNull();
    expect(buildDelayedRunDate('abc', 'minutes')).toBeNull();
    expect(buildDelayedRunDate(5, 'seconds')).toBeNull();
    expect(buildDelayedRunDate(5, undefined)).toBeNull();
  });
});

describe('buildCronExpression', () => {
  it("'daily' với scheduleTime → '<m> <h> * * *'", () => {
    expect(buildCronExpression({ scheduleType: 'daily', scheduleTime: '09:30' })).toBe('30 09 * * *');
  });

  it("'weekly' default dow=1, custom dow=3", () => {
    expect(buildCronExpression({ scheduleType: 'weekly', scheduleTime: '09:30' })).toBe('30 09 * * 1');
    expect(buildCronExpression({ scheduleType: 'weekly', scheduleTime: '09:30', weeklyDay: '3' })).toBe(
      '30 09 * * 3'
    );
  });

  it("'monthly' → ngày 1", () => {
    expect(buildCronExpression({ scheduleType: 'monthly', scheduleTime: '09:30' })).toBe('30 09 1 * *');
  });

  it("'custom' với customIntervalDays", () => {
    expect(
      buildCronExpression({ scheduleType: 'custom', scheduleTime: '09:30', customIntervalDays: '5' })
    ).toBe('30 09 */5 * *');
    expect(
      buildCronExpression({ scheduleType: 'custom', scheduleTime: '09:30', customIntervalDays: 0 })
    ).toBe('');
  });

  it("'once' với scheduleDate → date+month của ngày đã chọn", () => {
    const out = buildCronExpression({
      scheduleType: 'once',
      scheduleTime: '09:30',
      scheduleDate: '2026-05-15',
    });
    expect(out).toMatch(/^30 09 \d{1,2} \d{1,2} \*$/);
  });

  it('scheduleTime rỗng (trừ after_delay) → ""', () => {
    expect(buildCronExpression({ scheduleType: 'daily' })).toBe('');
    expect(buildCronExpression({})).toBe('');
  });

  it("'after_delay' với value/unit hợp lệ → cron với date+month của thời điểm sau delay", () => {
    const out = buildCronExpression({ scheduleType: 'after_delay', delayValue: 5, delayUnit: 'minutes' });
    expect(out).toMatch(/^\d{1,2} \d{1,2} \d{1,2} \d{1,2} \*$/);
  });

  it("'after_delay' value không hợp lệ → ''", () => {
    expect(buildCronExpression({ scheduleType: 'after_delay', delayValue: 0, delayUnit: 'minutes' })).toBe(
      ''
    );
  });

  it('scheduleType lạ → ""', () => {
    expect(buildCronExpression({ scheduleType: 'unknown', scheduleTime: '09:30' })).toBe('');
  });
});

describe('getScheduleTypeLabel', () => {
  it.each([
    ['once', 'Chạy 1 lần'],
    ['daily', 'Hàng ngày'],
    ['weekly', 'Hàng tuần'],
    ['monthly', 'Hàng tháng'],
    ['hourly', 'Hàng giờ'],
    ['custom', 'Tùy chỉnh'],
  ])('%s → %s', (type, label) => {
    expect(getScheduleTypeLabel(type)).toBe(label);
  });

  it('type lạ → trả nguyên', () => {
    expect(getScheduleTypeLabel('xyz')).toBe('xyz');
  });
});

describe('isCompletedOnceSchedule / isStoppedOnceSchedule / isReadonlyOnceSchedule', () => {
  const make = (runCount, lastRunStatus) => ({ scheduleType: 'once', runCount, lastRunStatus });

  it('completed = once + runCount > 0', () => {
    expect(isCompletedOnceSchedule(make(1, 'success'))).toBe(true);
    expect(isCompletedOnceSchedule(make(0, ''))).toBe(false);
    expect(isCompletedOnceSchedule({ scheduleType: 'daily', runCount: 1 })).toBe(false);
  });

  it('stopped = once + runCount > 0 + lastRunStatus="stopped" (case-insensitive)', () => {
    expect(isStoppedOnceSchedule(make(1, 'stopped'))).toBe(true);
    expect(isStoppedOnceSchedule(make(1, 'STOPPED'))).toBe(true);
    expect(isStoppedOnceSchedule(make(1, 'success'))).toBe(false);
    expect(isStoppedOnceSchedule(make(0, 'stopped'))).toBe(false);
  });

  it('readonly = stopped OR completed', () => {
    expect(isReadonlyOnceSchedule(make(1, 'stopped'))).toBe(true);
    expect(isReadonlyOnceSchedule(make(1, 'success'))).toBe(true);
    expect(isReadonlyOnceSchedule(make(0, ''))).toBe(false);
  });
});

describe('getWeeklyDayLabel / getWeeklyDayFromCron', () => {
  it('label match → trả label, không match → "Thứ 2" (fallback)', () => {
    expect(getWeeklyDayLabel('3', WEEKLY_DAY_OPTIONS)).toBe('Thứ 4');
    expect(getWeeklyDayLabel(3, WEEKLY_DAY_OPTIONS)).toBe('Thứ 4');
    expect(getWeeklyDayLabel('99', WEEKLY_DAY_OPTIONS)).toBe('Thứ 2');
    expect(getWeeklyDayLabel(0, WEEKLY_DAY_OPTIONS)).toBe('Chủ nhật');
  });

  it('parse cron dow ở field 5 (index 4)', () => {
    expect(getWeeklyDayFromCron('0 9 * * 3', WEEKLY_DAY_OPTIONS)).toBe('3');
    expect(getWeeklyDayFromCron('0 9 * * 99', WEEKLY_DAY_OPTIONS)).toBe('1');
    expect(getWeeklyDayFromCron('partial cron', WEEKLY_DAY_OPTIONS)).toBe('1');
    expect(getWeeklyDayFromCron('')).toBe('1');
  });
});

describe('getScheduleStatusLabel / getScheduleStatusClassName', () => {
  it('stopped once → "Đã dừng" + badge-gray', () => {
    const s = { scheduleType: 'once', runCount: 1, lastRunStatus: 'stopped' };
    expect(getScheduleStatusLabel(s)).toBe('Đã dừng');
    expect(getScheduleStatusClassName(s)).toBe('badge-gray');
  });

  it('completed once → "Đã hoàn thành" + badge-info', () => {
    const s = { scheduleType: 'once', runCount: 1, lastRunStatus: 'success' };
    expect(getScheduleStatusLabel(s)).toBe('Đã hoàn thành');
    expect(getScheduleStatusClassName(s)).toBe('badge-info');
  });

  it('enabled → "Đang bật" + badge-success', () => {
    expect(getScheduleStatusLabel({ enabled: true })).toBe('Đang bật');
    expect(getScheduleStatusClassName({ enabled: true })).toBe('badge-success');
  });

  it('disabled → "Đã tắt" + badge-gray', () => {
    expect(getScheduleStatusLabel({ enabled: false })).toBe('Đã tắt');
    expect(getScheduleStatusClassName({})).toBe('badge-gray');
  });
});

describe('filterSchedulesByCampaignId', () => {
  it('lọc theo campaignId, cast về số', () => {
    const list = [
      { id: 1, campaignId: 10 },
      { id: 2, campaignId: '10' },
      { id: 3, campaignId: 20 },
    ];
    expect(filterSchedulesByCampaignId(list, 10).map((s) => s.id)).toEqual([1, 2]);
    expect(filterSchedulesByCampaignId(list, '20').map((s) => s.id)).toEqual([3]);
  });

  it('campaignId không phải số → []', () => {
    expect(filterSchedulesByCampaignId([{ campaignId: 1 }], 'abc')).toEqual([]);
  });
});

describe('parseCronMinuteHourFiveField / formatScheduleRunClockFromCron', () => {
  it('cron đủ field, phút giờ hợp lệ → object', () => {
    expect(parseCronMinuteHourFiveField('30 9 * * *')).toEqual({ minute: 30, hour: 9 });
  });

  it('phút/giờ ngoài range → null', () => {
    expect(parseCronMinuteHourFiveField('60 9 * * *')).toBeNull();
    expect(parseCronMinuteHourFiveField('30 24 * * *')).toBeNull();
  });

  it('wildcard ở phút/giờ → null', () => {
    expect(parseCronMinuteHourFiveField('* * * * *')).toBeNull();
    expect(parseCronMinuteHourFiveField('30 * * * *')).toBeNull();
  });

  it('formatScheduleRunClockFromCron — pad 2 số', () => {
    expect(formatScheduleRunClockFromCron('5 9 * * *')).toBe('09:05');
    expect(formatScheduleRunClockFromCron('0 0 * * *')).toBe('00:00');
    expect(formatScheduleRunClockFromCron('xxx')).toBeNull();
  });
});

describe('isCronExpressionOneTimeRun / isScheduleOneTimeRun', () => {
  it('cron ngày+tháng cụ thể, dow=* → one-time', () => {
    expect(isCronExpressionOneTimeRun('30 9 15 5 *')).toBe(true);
  });

  it('cron có wildcard ở ngày hoặc tháng → false', () => {
    expect(isCronExpressionOneTimeRun('30 9 * 5 *')).toBe(false);
    expect(isCronExpressionOneTimeRun('30 9 1 * *')).toBe(false);
  });

  it("dow != '*' (weekly) → false", () => {
    expect(isCronExpressionOneTimeRun('30 9 1 5 3')).toBe(false);
  });

  it('ngày/tháng vượt range → false', () => {
    expect(isCronExpressionOneTimeRun('30 9 32 5 *')).toBe(false);
    expect(isCronExpressionOneTimeRun('30 9 15 13 *')).toBe(false);
  });

  it('isScheduleOneTimeRun — scheduleType=once → true (kể cả không cron)', () => {
    expect(isScheduleOneTimeRun({ scheduleType: 'once' })).toBe(true);
  });

  it('isScheduleOneTimeRun — fallback theo cron khi type khác', () => {
    expect(isScheduleOneTimeRun({ scheduleType: '', cronExpression: '30 9 15 5 *' })).toBe(true);
    expect(isScheduleOneTimeRun({ scheduleType: 'daily', cronExpression: '30 9 * * *' })).toBe(false);
  });
});

describe('resolveScheduleNextRunAt', () => {
  it('schedule null → null', () => {
    expect(resolveScheduleNextRunAt(null)).toBeNull();
  });

  it('daily cron → Date instance trong tương lai (>= now)', () => {
    const now = new Date('2026-05-15T05:00:00Z');
    const out = resolveScheduleNextRunAt(
      { scheduleType: 'daily', cronExpression: '30 9 * * *' },
      now
    );
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBeGreaterThan(now.getTime());
  });

  it('monthly cron → mốc ngày 1 tháng kế tiếp / cùng tháng', () => {
    const now = new Date('2026-05-15T05:00:00Z');
    const out = resolveScheduleNextRunAt(
      { scheduleType: 'monthly', cronExpression: '30 9 1 * *' },
      now
    );
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBeGreaterThan(now.getTime());
  });

  it('cron sai/thiếu field → fallback nextRunAt API', () => {
    const out = resolveScheduleNextRunAt(
      { scheduleType: 'unknown', cronExpression: '', nextRunAt: '2026-06-01T00:00:00Z' },
      new Date('2026-05-15T05:00:00Z')
    );
    expect(out).toBeInstanceOf(Date);
    expect(out.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('custom với intervalDays + createdAt cũ → mốc kế tiếp >= now', () => {
    const now = new Date('2026-05-15T05:00:00Z');
    const out = resolveScheduleNextRunAt(
      {
        scheduleType: 'custom',
        cronExpression: '0 9 */3 * *',
        createdAt: '2026-04-01T09:00:00Z',
      },
      now
    );
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it('hourly cron pattern (M * * * *) → mốc kế tiếp trong vòng 1 giờ', () => {
    const now = new Date('2026-05-15T05:00:00Z');
    const out = resolveScheduleNextRunAt(
      { scheduleType: 'hourly', cronExpression: '30 * * * *' },
      now
    );
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime() - now.getTime()).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(out.getTime() - now.getTime()).toBeGreaterThan(0);
  });
});

describe('resolveOneTimeSchedulePlannedAt', () => {
  it('cron không phải one-time → null', () => {
    expect(
      resolveOneTimeSchedulePlannedAt({ cronExpression: '30 9 * * *', createdAt: '2026-01-01' })
    ).toBeNull();
  });

  it('cron one-time + createdAt → Date instance trong/sau createdAt', () => {
    const out = resolveOneTimeSchedulePlannedAt({
      cronExpression: '30 9 15 5 *',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(out).toBeInstanceOf(Date);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(4);
    expect(out.getDate()).toBe(15);
  });
});

describe('resolveScheduleUiTimingDate', () => {
  it('one-time → ưu tiên plannedAt', () => {
    const out = resolveScheduleUiTimingDate({
      scheduleType: 'once',
      cronExpression: '30 9 15 5 *',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(out).toBeInstanceOf(Date);
    expect(out.getMonth()).toBe(4);
  });

  it('schedule null → null', () => {
    expect(resolveScheduleUiTimingDate(null)).toBeNull();
  });

  it('daily fallback resolveScheduleNextRunAt', () => {
    const out = resolveScheduleUiTimingDate(
      { scheduleType: 'daily', cronExpression: '30 9 * * *' },
      new Date('2026-05-15T05:00:00Z')
    );
    expect(out).toBeInstanceOf(Date);
  });
});

describe('getScheduleRunTimingFieldLabelVi', () => {
  it("one-time → 'Lịch chạy'", () => {
    expect(getScheduleRunTimingFieldLabelVi({ scheduleType: 'once' })).toBe('Lịch chạy');
  });

  it("recurring → 'Lần chạy tiếp theo'", () => {
    expect(getScheduleRunTimingFieldLabelVi({ scheduleType: 'daily' })).toBe('Lần chạy tiếp theo');
  });
});

describe('getSchedulePatternSummaryVi', () => {
  const getWeeklyFromCron = (c) => getWeeklyDayFromCron(c, WEEKLY_DAY_OPTIONS);
  const getWeeklyLabel = (d) => getWeeklyDayLabel(d, WEEKLY_DAY_OPTIONS);

  it("weekly → 'Hàng tuần vào <thứ> — lúc HH:mm'", () => {
    const out = getSchedulePatternSummaryVi(
      { scheduleType: 'weekly', cronExpression: '30 9 * * 3' },
      getWeeklyFromCron,
      getWeeklyLabel
    );
    expect(out).toBe('Hàng tuần vào Thứ 4 — lúc 09:30');
  });

  it("custom với intervalDays → 'Mỗi N ngày (theo mốc bắt đầu) — lúc HH:mm'", () => {
    const out = getSchedulePatternSummaryVi(
      { scheduleType: 'custom', cronExpression: '0 9 */5 * *' },
      getWeeklyFromCron,
      getWeeklyLabel
    );
    expect(out).toBe('Mỗi 5 ngày (theo mốc bắt đầu) — lúc 09:00');
  });

  it("custom không parse được intervalDays → fallback label", () => {
    const out = getSchedulePatternSummaryVi(
      { scheduleType: 'custom', cronExpression: '0 9 * * *' },
      getWeeklyFromCron,
      getWeeklyLabel
    );
    expect(out).toBe('Tùy chỉnh — lúc 09:00');
  });

  it('cron không đọc được giờ → không có "lúc"', () => {
    const out = getSchedulePatternSummaryVi(
      { scheduleType: 'daily', cronExpression: 'bad' },
      getWeeklyFromCron,
      getWeeklyLabel
    );
    expect(out).toBe('Hàng ngày');
  });
});
