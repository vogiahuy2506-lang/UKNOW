import { describe, expect, it } from '@jest/globals';
import { listScheduleFireTimes } from '../campaignScheduleCron.util.js';

// 2026-09-12 (thứ Bảy) 10:00 Asia/Ho_Chi_Minh = 03:00 UTC. 09:00 Hà Nội = 02:00Z.
const NOW = new Date('2026-09-12T03:00:00.000Z');
const days = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const schedule = (overrides = {}) => ({
  enabled: true,
  schedule_type: 'daily',
  cron_expression: '0 9 * * *',
  last_run_at: null,
  created_at: '2026-09-12T01:00:00.000Z',
  ...overrides,
});
const iso = (dates) => dates.map((d) => d.toISOString());

describe('listScheduleFireTimes — liệt kê các lần lịch nổ, cùng luật computeScheduleNextRunAt', () => {
  it('daily 09:00 trong 3 ngày tới → 13, 14, 15/09 (mốc 15/09 09:00 = 02:00Z nằm trong cửa sổ, lần 16/09 thì không)', () => {
    expect(iso(listScheduleFireTimes(schedule(), { now: NOW, until: days(3) }))).toEqual([
      '2026-09-13T02:00:00.000Z', '2026-09-14T02:00:00.000Z', '2026-09-15T02:00:00.000Z',
    ]);
  });

  it('weekly thứ Hai 09:00 trong 15 ngày → 14/09 và 21/09', () => {
    expect(iso(listScheduleFireTimes(schedule({ schedule_type: 'weekly', cron_expression: '0 9 * * 1' }), { now: NOW, until: days(15) }))).toEqual([
      '2026-09-14T02:00:00.000Z', '2026-09-21T02:00:00.000Z',
    ]);
  });

  it('custom mỗi 2 ngày, tạo 12/09: ngày lệch 1 bị bỏ → 14/09 và 16/09', () => {
    const fires = listScheduleFireTimes(
      schedule({ schedule_type: 'custom', cron_expression: '0 9 */2 * *' }),
      { now: NOW, until: days(5) }
    );
    expect(iso(fires)).toEqual(['2026-09-14T02:00:00.000Z', '2026-09-16T02:00:00.000Z']);
  });

  it('once rơi ngoài cửa sổ (năm sau) → rỗng; lịch tắt / cron hỏng / null → rỗng', () => {
    expect(listScheduleFireTimes(schedule({ schedule_type: 'once', cron_expression: '30 19 9 4 *' }), { now: NOW, until: days(60) })).toEqual([]);
    expect(listScheduleFireTimes(schedule({ enabled: false }), { now: NOW, until: days(60) })).toEqual([]);
    expect(listScheduleFireTimes(schedule({ cron_expression: 'abc' }), { now: NOW, until: days(60) })).toEqual([]);
    expect(listScheduleFireTimes(null, { now: NOW, until: days(60) })).toEqual([]);
  });

  it('once trong cửa sổ → đúng một lần: "0 6 3 10 *" = 06:00 03/10 Hà Nội = 02/10 23:00Z', () => {
    expect(iso(listScheduleFireTimes(schedule({ schedule_type: 'once', cron_expression: '0 6 3 10 *' }), { now: NOW, until: days(60) })))
      .toEqual(['2026-10-02T23:00:00.000Z']);
  });

  it('cron dày (mỗi phút) bị cắt ở maxCount, không liệt kê hàng chục nghìn lần', () => {
    const fires = listScheduleFireTimes(schedule({ cron_expression: '* * * * *' }), { now: NOW, until: days(60), maxCount: 5 });
    expect(fires).toHaveLength(5);
  });
});
