import { beforeEach, describe, expect, it } from '@jest/globals';
import chatbotRateLimitService from '../chatbotRateLimit.service.js';

describe('chatbotRateLimit.service', () => {
  beforeEach(() => {
    chatbotRateLimitService._resetMemoryForTests();
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '3';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '10';
    process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '100';
  });

  it('allows first requests then blocks by sender minute limit without needing Redis', async () => {
    const params = {
      channel: 'web',
      ownerUserId: 1,
      chatbotId: 9,
      senderKey: 'sess_abc',
    };

    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);

    const blocked = await chatbotRateLimitService.checkBeforeAi(params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('sender_minute');
    expect(blocked.staticReply).toBeTruthy();
  });

  it('uses different counters per sender', async () => {
    const base = { channel: 'zalo_oa', ownerUserId: 1, chatbotId: 2 };
    for (let i = 0; i < 3; i++) {
      await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_a' });
    }
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_a' })).allowed).toBe(false);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_b' })).allowed).toBe(true);
  });
});
