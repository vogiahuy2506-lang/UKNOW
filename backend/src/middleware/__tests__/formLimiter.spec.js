import { describe, it, expect } from '@jest/globals';
import {
  PUBLIC_FORM_SUBMISSION_CONFIG,
  publicFormSubmissionLimiter,
} from '../rateLimiter.middleware.js';

describe('publicFormSubmissionLimiter config', () => {
  it('cấu hình đúng 25 lần / 15 phút cho public form limiter', () => {
    expect(PUBLIC_FORM_SUBMISSION_CONFIG.max).toBe(25);
    expect(PUBLIC_FORM_SUBMISSION_CONFIG.windowMs).toBe(15 * 60 * 1000);
    expect(PUBLIC_FORM_SUBMISSION_CONFIG.code).toBe('PUBLIC_FORM_RATE_LIMIT_EXCEEDED');
    expect(typeof publicFormSubmissionLimiter).toBe('function');
  });
});
