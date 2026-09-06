import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { DEFAULT_STALE_SENDING_SECONDS, getStaleSendingSeconds } from '../sendQuota.config.js';

describe('sendQuota.config getStaleSendingSeconds', () => {
  const originalEnv = process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS;

  beforeEach(() => {
    delete process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = originalEnv;
    } else {
      delete process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS;
    }
  });

  it('returns default 300s when env is unset and no override is provided', () => {
    expect(DEFAULT_STALE_SENDING_SECONDS).toBe(300);
    expect(getStaleSendingSeconds()).toBe(300);
    expect(getStaleSendingSeconds(null)).toBe(300);
    expect(getStaleSendingSeconds(undefined)).toBe(300);
  });

  it('reads override parameter when provided', () => {
    expect(getStaleSendingSeconds(180)).toBe(180);
    expect(getStaleSendingSeconds('450')).toBe(450);
  });

  it('reads env variable when override is not provided', () => {
    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = '600';
    expect(getStaleSendingSeconds()).toBe(600);
  });

  it('prioritizes parameter override over env variable', () => {
    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = '600';
    expect(getStaleSendingSeconds(120)).toBe(120);
  });

  it('falls back to default 300s on invalid values (negative, zero, NaN, empty string)', () => {
    expect(getStaleSendingSeconds(-10)).toBe(300);
    expect(getStaleSendingSeconds(0)).toBe(300);
    expect(getStaleSendingSeconds('invalid')).toBe(300);
    expect(getStaleSendingSeconds('')).toBe(300);

    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = 'invalid';
    expect(getStaleSendingSeconds()).toBe(300);

    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = '-50';
    expect(getStaleSendingSeconds()).toBe(300);
  });

  it('strictly rejects non-integer strings like "300abc", "1.9", " 45 seconds"', () => {
    expect(getStaleSendingSeconds('300abc')).toBe(300);
    expect(getStaleSendingSeconds('1.9')).toBe(300);
    expect(getStaleSendingSeconds(' 45 seconds')).toBe(300);

    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = '300abc';
    expect(getStaleSendingSeconds()).toBe(300);

    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = '1.9';
    expect(getStaleSendingSeconds()).toBe(300);

    process.env.SEND_QUOTA_SENDING_UNCERTAIN_SECONDS = ' 45 seconds';
    expect(getStaleSendingSeconds()).toBe(300);
  });

  it('clamps values to safe boundaries [1s, 86400s]', () => {
    expect(getStaleSendingSeconds(100000)).toBe(86400);
    expect(getStaleSendingSeconds('999999')).toBe(86400);
  });
});
