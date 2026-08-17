import { describe, expect, it } from '@jest/globals';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../manualRecipients.util.js';

describe('manualRecipients', () => {
  it('normalizes and deduplicates emails, phones, and uids', () => {
    expect(validateManualRecipients({
      emails: 'A@example.com\na@example.com',
      phones: '0912345678, 0912345678',
      uids: '123456789012345678, 123456789012345678',
    })).toEqual({
      emails: ['a@example.com'],
      phones: ['0912345678'],
      uids: ['123456789012345678'],
    });
  });

  it('validates 18-19 digit Zalo UIDs correctly', () => {
    const res = validateManualRecipients({
      uids: ['1234567890123456789', '9876543210987654321'],
    });
    expect(res.uids).toHaveLength(2);
    expect(res.uids[0]).toBe('1234567890123456789');
  });

  it('rejects invalid uids', () => {
    expect(() => validateManualRecipients({ uids: 'not-a-uid' })).toThrow('UID Zalo không hợp lệ');
    expect(() => validateManualRecipients({ uids: '123' })).toThrow('UID Zalo không hợp lệ'); // < 6 chars
  });

  it('rejects invalid input and values over the hard limit', () => {
    expect(() => validateManualRecipients({ emails: 'not-an-email' })).toThrow('email không hợp lệ');
    expect(() => validateManualRecipients({ emails: Array.from({ length: MAX_AI_MANUAL_RECIPIENTS + 1 }, (_, i) => `u${i}@example.test`) }))
      .toThrow('tối đa');
  });
});
