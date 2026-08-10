import { describe, it, expect } from 'vitest';
import { assertOnceScheduleNotInPast } from '../campaignRunSchedule.helpers';

function hanoiYmdHm(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const v = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    time: `${v.hour}:${v.minute}`,
    hour: Number(v.hour),
    minute: Number(v.minute),
  };
}

function addMinutesHanoiForm(base, addMin) {
  const at = new Date(base.getTime() + addMin * 60 * 1000);
  const { date, time } = hanoiYmdHm(at);
  return { scheduleDate: date, scheduleTime: time };
}

describe('assertOnceScheduleNotInPast', () => {
  const now = new Date('2026-06-15T05:00:00.000Z'); // 12:00 Hanoi

  it('blocks once when time already passed today', () => {
    const form = {
      scheduleType: 'once',
      scheduleDate: '2026-06-15',
      scheduleTime: '10:00',
    };
    expect(assertOnceScheduleNotInPast(form, now).ok).toBe(false);
  });

  it('blocks once when only 1 minute ahead (2-minute lead)', () => {
    const { scheduleDate, scheduleTime } = addMinutesHanoiForm(now, 1);
    expect(
      assertOnceScheduleNotInPast(
        { scheduleType: 'once', scheduleDate, scheduleTime },
        now
      ).ok
    ).toBe(false);
  });

  it('allows once when 5 minutes ahead', () => {
    const { scheduleDate, scheduleTime } = addMinutesHanoiForm(now, 5);
    expect(
      assertOnceScheduleNotInPast(
        { scheduleType: 'once', scheduleDate, scheduleTime },
        now
      ).ok
    ).toBe(true);
  });

  it('does not block daily when hour already passed', () => {
    expect(
      assertOnceScheduleNotInPast(
        { scheduleType: 'daily', scheduleDate: '2026-06-15', scheduleTime: '08:00' },
        now
      ).ok
    ).toBe(true);
  });

  it('ignores after_delay / weekly / monthly / custom', () => {
    for (const scheduleType of ['after_delay', 'weekly', 'monthly', 'custom']) {
      expect(
        assertOnceScheduleNotInPast(
          { scheduleType, scheduleDate: '2026-01-01', scheduleTime: '01:00' },
          now
        ).ok
      ).toBe(true);
    }
  });
});
