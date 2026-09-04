import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveReferralCode,
  getStoredReferralCode,
  clearStoredReferralCode,
  captureReferralFromUrl,
} from '../referralStorage.js';

describe('referralStorage utility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves and retrieves referral code correctly', () => {
    saveReferralCode('abc123xy');
    expect(getStoredReferralCode()).toBe('ABC123XY');
  });

  it('ignores empty or invalid input', () => {
    saveReferralCode('');
    saveReferralCode(null);
    saveReferralCode(undefined);
    expect(getStoredReferralCode()).toBe('');
  });

  it('clears stored referral code', () => {
    saveReferralCode('REFCODE1');
    expect(getStoredReferralCode()).toBe('REFCODE1');
    clearStoredReferralCode();
    expect(getStoredReferralCode()).toBe('');
  });

  it('expires code after 30 days', () => {
    saveReferralCode('EXPIRE30');
    expect(getStoredReferralCode()).toBe('EXPIRE30');

    // Fast-forward 31 days
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);

    expect(getStoredReferralCode()).toBe('');
    expect(localStorage.getItem('uknow_referral')).toBeNull();
  });

  it('captures referral code from query string', () => {
    const code = captureReferralFromUrl('?ref=partner99&utm_source=fb');
    expect(code).toBe('PARTNER99');
    expect(getStoredReferralCode()).toBe('PARTNER99');
  });

  it('returns empty string if ref query parameter is missing', () => {
    const code = captureReferralFromUrl('?utm_source=fb');
    expect(code).toBe('');
  });
});
