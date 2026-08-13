import {
  hasEnabledChatbotReplyLimit,
  normalizeChatbotReplyLimitConfig,
} from '../chatbotReplyLimit.util.js';

describe('chatbotReplyLimit util', () => {
  it('returns a complete disabled config for missing data', () => {
    const config = normalizeChatbotReplyLimitConfig(null);
    expect(config.version).toBe(1);
    expect(config.windows.minute).toEqual({ limit: null, action: 'silent', message: '' });
    expect(config.windows.month).toEqual({ limit: null, action: 'silent', message: '' });
    expect(hasEnabledChatbotReplyLimit(config)).toBe(false);
  });

  it('normalizes all windows and keeps a notify message', () => {
    const config = normalizeChatbotReplyLimitConfig({
      windows: {
        minute: { limit: '5', action: 'silent' },
        month: { limit: 900, action: 'notify', message: 'Đã hết lượt tháng' },
      },
    }, { strict: true });

    expect(config.windows.minute.limit).toBe(5);
    expect(config.windows.month).toEqual({
      limit: 900,
      action: 'notify',
      message: 'Đã hết lượt tháng',
    });
    expect(hasEnabledChatbotReplyLimit(config)).toBe(true);
  });

  it('rejects invalid limits and oversized messages in strict mode', () => {
    expect(() => normalizeChatbotReplyLimitConfig({
      windows: { hour: { limit: 0 } },
    }, { strict: true })).toThrow(/số nguyên/);

    expect(() => normalizeChatbotReplyLimitConfig({
      windows: { day: { limit: 2, action: 'notify', message: 'x'.repeat(501) } },
    }, { strict: true })).toThrow(/500/);
  });

  it('rejects an unknown exhausted action in strict mode', () => {
    expect(() => normalizeChatbotReplyLimitConfig({
      windows: { hour: { limit: 2, action: 'redirect' } },
    }, { strict: true })).toThrow(/silent hoặc notify/);
  });
});
