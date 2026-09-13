import { describe, expect, it } from '@jest/globals';
import {
  computeScheduleNextRunAt,
  parseCustomIntervalDaysFromCron,
  resolveRuntimeCronExpression,
} from '../campaignScheduleCron.util.js';

// 2026-09-12 (thứ Bảy) 10:00 Asia/Ho_Chi_Minh = 03:00 UTC
const NOW = new Date('2026-09-12T03:00:00.000Z');

const schedule = (overrides = {}) => ({
  enabled: true,
  schedule_type: 'daily',
  cron_expression: '0 9 * * *',
  last_run_at: null,
  created_at: '2026-09-01T01:00:00.000Z',
  ...overrides,
});

describe('computeScheduleNextRunAt — "lần chạy tiếp" tính lúc đọc, cùng luật với scheduler', () => {
  it('daily 09:00 Hà Nội, đã qua hôm nay → 09:00 ngày mai (02:00Z)', () => {
    expect(computeScheduleNextRunAt(schedule(), NOW)?.toISOString()).toBe('2026-09-13T02:00:00.000Z');
  });

  it('daily 11:00 Hà Nội, chưa tới → ngay hôm nay', () => {
    expect(computeScheduleNextRunAt(schedule({ cron_expression: '0 11 * * *' }), NOW)?.toISOString())
      .toBe('2026-09-12T04:00:00.000Z');
  });

  it('weekly thứ Hai 09:00 → thứ Hai 14/09', () => {
    expect(
      computeScheduleNextRunAt(schedule({ schedule_type: 'weekly', cron_expression: '0 9 * * 1' }), NOW)?.toISOString()
    ).toBe('2026-09-14T02:00:00.000Z');
  });

  it('once đã qua trong năm → năm sau, đúng như node-cron sẽ nổ (không giấu)', () => {
    expect(
      computeScheduleNextRunAt(schedule({ schedule_type: 'once', cron_expression: '30 19 9 4 *' }), NOW)?.toISOString()
    ).toBe('2027-04-09T12:30:00.000Z');
  });

  it('lịch tắt → null; cron hỏng → null; thiếu cron → null', () => {
    expect(computeScheduleNextRunAt(schedule({ enabled: false }), NOW)).toBeNull();
    expect(computeScheduleNextRunAt(schedule({ cron_expression: 'abc' }), NOW)).toBeNull();
    expect(computeScheduleNextRunAt(schedule({ cron_expression: '' }), NOW)).toBeNull();
    expect(computeScheduleNextRunAt(null, NOW)).toBeNull();
  });

  describe('custom mỗi N ngày — cron hằng ngày nhưng chỉ ngày chia hết cho N kể từ mốc', () => {
    it('N=2, tạo hôm nay, 09:00 đã qua → bỏ ngày mai (lệch 1), lấy 14/09 (lệch 2)', () => {
      const next = computeScheduleNextRunAt(
        schedule({ schedule_type: 'custom', cron_expression: '0 9 */2 * *', created_at: '2026-09-12T01:00:00.000Z' }),
        NOW
      );
      expect(next?.toISOString()).toBe('2026-09-14T02:00:00.000Z');
    });

    it('N=2, đã chạy hôm nay (last_run_at ưu tiên hơn created_at) → 14/09', () => {
      const next = computeScheduleNextRunAt(
        schedule({
          schedule_type: 'custom',
          cron_expression: '0 9 */2 * *',
          created_at: '2026-09-01T01:00:00.000Z',
          last_run_at: '2026-09-12T02:00:00.000Z',
        }),
        NOW
      );
      expect(next?.toISOString()).toBe('2026-09-14T02:00:00.000Z');
    });

    it('N=3, mốc 10/09 → 13/09 (lệch 3), không phải ngày mai', () => {
      const next = computeScheduleNextRunAt(
        schedule({ schedule_type: 'custom', cron_expression: '0 9 */3 * *', created_at: '2026-09-10T01:00:00.000Z' }),
        NOW
      );
      expect(next?.toISOString()).toBe('2026-09-13T02:00:00.000Z');
    });

    it('custom nhưng cron không phải dạng */N → coi như cron thường (giống scheduler: intervalDays null → chạy)', () => {
      const next = computeScheduleNextRunAt(
        schedule({ schedule_type: 'custom', cron_expression: '0 9 5 * *' }),
        NOW
      );
      // resolveRuntimeCronExpression ép custom về hằng ngày → 09:00 ngày mai
      expect(next?.toISOString()).toBe('2026-09-13T02:00:00.000Z');
    });
  });
});

describe('helper dời từ scheduler.js — hành vi giữ nguyên', () => {
  it('resolveRuntimeCronExpression: custom → hằng ngày cùng giờ/phút, loại khác giữ nguyên', () => {
    expect(resolveRuntimeCronExpression({ schedule_type: 'custom', cron_expression: '15 8 */4 * *' })).toBe('15 8 * * *');
    expect(resolveRuntimeCronExpression({ schedule_type: 'weekly', cron_expression: '0 9 * * 1' })).toBe('0 9 * * 1');
    expect(resolveRuntimeCronExpression({ schedule_type: 'custom', cron_expression: '5' })).toBe('5');
  });

  it('parseCustomIntervalDaysFromCron: đọc N từ trường ngày-tháng, sai dạng → null', () => {
    expect(parseCustomIntervalDaysFromCron('0 9 */2 * *')).toBe(2);
    expect(parseCustomIntervalDaysFromCron('0 9 * * *')).toBeNull();
    expect(parseCustomIntervalDaysFromCron('0 9 */0 * *')).toBeNull();
    expect(parseCustomIntervalDaysFromCron('')).toBeNull();
  });
});
