import { describe, expect, it } from '@jest/globals';
import { isZaloAccountChatbotEnabled } from '../../utils/zaloAccountChatbotGate.util.js';

describe('isZaloAccountChatbotEnabled (V-1)', () => {
  it('returns false when accountSettings is missing', () => {
    expect(isZaloAccountChatbotEnabled(null)).toBe(false);
    expect(isZaloAccountChatbotEnabled(undefined)).toBe(false);
  });

  it('returns false when is_enabled is undefined/false even if channel would be on', () => {
    expect(isZaloAccountChatbotEnabled({})).toBe(false);
    expect(isZaloAccountChatbotEnabled({ is_enabled: false })).toBe(false);
  });

  it('returns true only when account is_enabled === true', () => {
    expect(isZaloAccountChatbotEnabled({ is_enabled: true })).toBe(true);
  });
});
