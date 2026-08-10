import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  shouldStayAiPaused,
  computeAiResumeAt,
  _resetAiHandoffAutoResumeCacheForTests,
} from '../aiHandoffResume.util.js';

describe('shouldStayAiPaused', () => {
  beforeEach(() => {
    _resetAiHandoffAutoResumeCacheForTests();
  });

  const now = Date.parse('2026-08-07T12:00:00.000Z');

  it('returns false when not paused', () => {
    expect(shouldStayAiPaused({
      aiPaused: false,
      aiPausedAt: new Date(now - 60_000).toISOString(),
      autoResumeMinutes: 15,
      now,
    })).toBe(false);
  });

  it('stays paused when auto-resume is off (null / 0)', () => {
    const pausedAt = new Date(now - 3_600_000).toISOString();
    expect(shouldStayAiPaused({
      aiPaused: true, aiPausedAt: pausedAt, autoResumeMinutes: null, now,
    })).toBe(true);
    expect(shouldStayAiPaused({
      aiPaused: true, aiPausedAt: pausedAt, autoResumeMinutes: 0, now,
    })).toBe(true);
  });

  it('stays paused when aiPausedAt missing or invalid', () => {
    expect(shouldStayAiPaused({
      aiPaused: true, aiPausedAt: null, autoResumeMinutes: 15, now,
    })).toBe(true);
    expect(shouldStayAiPaused({
      aiPaused: true, aiPausedAt: undefined, autoResumeMinutes: 15, now,
    })).toBe(true);
    expect(shouldStayAiPaused({
      aiPaused: true, aiPausedAt: 'not-a-date', autoResumeMinutes: 15, now,
    })).toBe(true);
  });

  it('stays paused when elapsed < setting', () => {
    expect(shouldStayAiPaused({
      aiPaused: true,
      aiPausedAt: new Date(now - 5 * 60_000).toISOString(),
      autoResumeMinutes: 15,
      now,
    })).toBe(true);
  });

  it('allows resume when elapsed >= setting', () => {
    expect(shouldStayAiPaused({
      aiPaused: true,
      aiPausedAt: new Date(now - 20 * 60_000).toISOString(),
      autoResumeMinutes: 15,
      now,
    })).toBe(false);
  });
});

describe('computeAiResumeAt', () => {
  const pausedAt = '2026-08-07T12:00:00.000Z';

  it('returns null when not paused or manual (no timestamp)', () => {
    expect(computeAiResumeAt({
      aiPaused: false, aiPausedAt: pausedAt, autoResumeMinutes: 15,
    })).toBeNull();
    expect(computeAiResumeAt({
      aiPaused: true, aiPausedAt: null, autoResumeMinutes: 15,
    })).toBeNull();
  });

  it('returns null when auto-resume minutes off', () => {
    expect(computeAiResumeAt({
      aiPaused: true, aiPausedAt: pausedAt, autoResumeMinutes: null,
    })).toBeNull();
    expect(computeAiResumeAt({
      aiPaused: true, aiPausedAt: pausedAt, autoResumeMinutes: 0,
    })).toBeNull();
  });

  it('adds minutes via getTime (ISO string safe)', () => {
    expect(computeAiResumeAt({
      aiPaused: true, aiPausedAt: pausedAt, autoResumeMinutes: 15,
    })).toBe('2026-08-07T12:15:00.000Z');
  });
});
