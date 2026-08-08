import { describe, expect, it } from '@jest/globals';
import { cooldownOk, isQuietHours } from '../alertEvaluator.service.js';

/** Wall-clock hour in Asia/Ho_Chi_Minh (no DST). */
function atHanoiHour(hour) {
  const hh = String(hour).padStart(2, '0');
  return new Date(`2026-06-15T${hh}:00:00+07:00`);
}

describe('isQuietHours (23:00–06:00 Asia/Ho_Chi_Minh)', () => {
  it('returns true at 23:00 VN', () => {
    expect(isQuietHours(atHanoiHour(23))).toBe(true);
  });

  it('returns true at 00:00 VN', () => {
    expect(isQuietHours(atHanoiHour(0))).toBe(true);
  });

  it('returns true at 05:00 VN', () => {
    expect(isQuietHours(atHanoiHour(5))).toBe(true);
  });

  it('returns false at 06:00 VN', () => {
    expect(isQuietHours(atHanoiHour(6))).toBe(false);
  });

  it('returns false at 12:00 VN', () => {
    expect(isQuietHours(atHanoiHour(12))).toBe(false);
  });

  it('uses the passed Date — not wall clock alone', () => {
    // Same local machine, different Hanoi hours must diverge
    expect(isQuietHours(atHanoiHour(5))).not.toBe(isQuietHours(atHanoiHour(12)));
  });
});

describe('cooldownOk', () => {
  it('allows fire when no prior event', () => {
    expect(cooldownOk(null, 60)).toBe(true);
    expect(cooldownOk({}, 60)).toBe(true);
  });

  it('skips when last fire was 10 minutes ago and cooldown is 60', () => {
    const lastEvent = { firedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
    expect(cooldownOk(lastEvent, 60)).toBe(false);
  });

  it('allows when last fire was 61 minutes ago and cooldown is 60', () => {
    const lastEvent = { firedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString() };
    expect(cooldownOk(lastEvent, 60)).toBe(true);
  });
});
