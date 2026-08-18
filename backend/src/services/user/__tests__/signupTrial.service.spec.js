import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { grantSignupTrial } from '../signupTrial.service.js';

describe('grantSignupTrial service unit tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('SIGNUP_TRIAL_ENABLED="false" → trả về null ngay', async () => {
    process.env.SIGNUP_TRIAL_ENABLED = 'false';
    const result = await grantSignupTrial({ userId: 1, userEmail: 'test@example.com' });
    expect(result).toBeNull();
  });

  it('thiếu userId hoặc userEmail → trả về null', async () => {
    expect(await grantSignupTrial({ userId: null, userEmail: 'test@example.com' })).toBeNull();
    expect(await grantSignupTrial({ userId: 1, userEmail: null })).toBeNull();
  });
});
