import { describe, it, expect } from '@jest/globals';
import { buildContinuousDataNodeItemKey } from '../campaignContinuousDedupKey.util.js';

describe('campaignContinuousDedupKey.util - buildContinuousDataNodeItemKey', () => {
  it('read_form_submissions: dùng submissionId -> "form_submission:<id>"', () => {
    const key = buildContinuousDataNodeItemKey('read_form_submissions', { submissionId: 42, id: 42 });
    expect(key).toBe('form_submission:42');
  });

  it('read_form_submissions: thiếu submissionId -> fallback email|phone', () => {
    const key = buildContinuousDataNodeItemKey('read_form_submissions', {
      email: 'A@Example.com',
      phone: '0901234567',
    });
    expect(key).toBe('form_submission_contact:a@example.com|0901234567');
  });

  it('read_form_submissions: hai item cùng submissionId -> cùng khoá (dedupe được)', () => {
    const keyA = buildContinuousDataNodeItemKey('read_form_submissions', { submissionId: 7, email: 'a@x.com' });
    const keyB = buildContinuousDataNodeItemKey('read_form_submissions', { submissionId: 7, email: 'b@y.com' });
    expect(keyA).toBe(keyB);
  });

  it('read_form_submissions: submissionId khác nhau -> khoá khác nhau', () => {
    const keyA = buildContinuousDataNodeItemKey('read_form_submissions', { submissionId: 7 });
    const keyB = buildContinuousDataNodeItemKey('read_form_submissions', { submissionId: 8 });
    expect(keyA).not.toBe(keyB);
  });

  it('read_landing_leads vẫn giữ nguyên hành vi cũ (không bị đổi khi thêm nhánh form)', () => {
    const key = buildContinuousDataNodeItemKey('read_landing_leads', { leadId: 99 });
    expect(key).toBe('lead:99');
  });

  it('subtype lạ -> fallback raw fingerprint ổn định (thứ tự khoá không ảnh hưởng)', () => {
    const keyA = buildContinuousDataNodeItemKey('unknown_subtype', { a: 1, b: 2 });
    const keyB = buildContinuousDataNodeItemKey('unknown_subtype', { b: 2, a: 1 });
    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('raw:')).toBe(true);
  });
});
