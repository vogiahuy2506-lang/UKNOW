import { describe, expect, it } from '@jest/globals';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../manualRecipients.util.js';

describe('manualRecipients', () => {
  it('normalizes and deduplicates emails and phones', () => {
    expect(validateManualRecipients({ emails: 'A@example.com\na@example.com', phones: '0912345678, 0912345678' }))
      .toEqual({ emails: ['a@example.com'], phones: ['0912345678'] });
  });

  it('rejects invalid input and values over the hard limit', () => {
    expect(() => validateManualRecipients({ emails: 'not-an-email' })).toThrow('email không hợp lệ');
    expect(() => validateManualRecipients({ emails: Array.from({ length: MAX_AI_MANUAL_RECIPIENTS + 1 }, (_, i) => `u${i}@example.test`) }))
      .toThrow('tối đa');
  });
});
