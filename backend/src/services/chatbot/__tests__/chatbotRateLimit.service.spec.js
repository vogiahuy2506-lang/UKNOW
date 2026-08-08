import { beforeEach, describe, expect, it } from '@jest/globals';
import chatbotRateLimitService from '../chatbotRateLimit.service.js';

describe('chatbotRateLimit.service', () => {
  beforeEach(() => {
    chatbotRateLimitService._resetMemoryForTests();
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '3';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '20';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '10';
    process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '100';
    delete process.env.CHATBOT_RATE_LIMIT_STATIC_REPLY;
  });

  it('allows first requests then blocks by sender minute without needing Redis', async () => {
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
    expect(blocked.shouldNotify).toBe(false);
    expect(blocked.staticReply).toMatch(/Trợ lý đang bận/);
  });

  it('uses different counters per sender', async () => {
    const base = { channel: 'zalo_oa', ownerUserId: 1, chatbotId: 2 };
    for (let i = 0; i < 3; i++) {
      await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_a' });
    }
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_a' })).allowed).toBe(false);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'uid_b' })).allowed).toBe(true);
  });

  it('blocks sender_hour before burning day quota further when minute is high', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '2';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '50';

    const params = {
      channel: 'web',
      ownerUserId: 1,
      chatbotId: 9,
      senderKey: 'sess_hour',
    };

    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    const blocked = await chatbotRateLimitService.checkBeforeAi(params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('sender_hour');
    expect(blocked.shouldNotify).toBe(false);
  });

  it('notifies once for sender_day then stays silent until marked', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '2';

    const params = {
      channel: 'zalo_personal',
      ownerUserId: 5,
      chatbotId: 8,
      senderKey: 'uid_day',
    };

    await chatbotRateLimitService.checkBeforeAi(params);
    await chatbotRateLimitService.checkBeforeAi(params);

    const firstBlock = await chatbotRateLimitService.checkBeforeAi(params);
    expect(firstBlock.allowed).toBe(false);
    expect(firstBlock.reason).toBe('sender_day');
    expect(firstBlock.shouldNotify).toBe(true);

    await chatbotRateLimitService.markRateLimitNotified({
      ...params,
      reason: 'sender_day',
    });

    const secondBlock = await chatbotRateLimitService.checkBeforeAi(params);
    expect(secondBlock.allowed).toBe(false);
    expect(secondBlock.reason).toBe('sender_day');
    expect(secondBlock.shouldNotify).toBe(false);
  });

  it('minute spam does not burn owner_cap', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1';
    chatbotRateLimitService._setOwnerCapForTests(42, 10);

    const params = {
      channel: 'web',
      ownerUserId: 42,
      chatbotId: 9,
      senderKey: 'spammer',
    };

    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    for (let i = 0; i < 20; i++) {
      const r = await chatbotRateLimitService.checkBeforeAi(params);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('sender_minute');
    }

    // Different sender should still have full owner cap available
    const other = await chatbotRateLimitService.checkBeforeAi({
      ...params,
      senderKey: 'other',
    });
    expect(other.allowed).toBe(true);
  });

  it('owner_cap is shared across senders and notifies each sender once', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '100';
    chatbotRateLimitService._setOwnerCapForTests(7, 2);

    const base = { channel: 'web', ownerUserId: 7, chatbotId: 1 };

    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'a' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'b' })).allowed).toBe(true);

    const blockA = await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'a' });
    expect(blockA.allowed).toBe(false);
    expect(blockA.reason).toBe('owner_cap');
    expect(blockA.shouldNotify).toBe(true);

    const blockB = await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'b' });
    expect(blockB.allowed).toBe(false);
    expect(blockB.reason).toBe('owner_cap');
    expect(blockB.shouldNotify).toBe(true);
  });

  it('counts owner usage even without a daily cap', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '100';

    const params = {
      channel: 'web',
      ownerUserId: 55,
      chatbotId: 3,
      senderKey: 'u1',
    };

    await chatbotRateLimitService.checkBeforeAi(params);
    await chatbotRateLimitService.checkBeforeAi(params);
    await chatbotRateLimitService.checkBeforeAi(params);

    expect(await chatbotRateLimitService.getOwnerUsedToday(55)).toBe(3);
  });

  it('increments owner count when blocking on owner_cap', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '100';
    chatbotRateLimitService._setOwnerCapForTests(66, 2);

    const params = {
      channel: 'web',
      ownerUserId: 66,
      chatbotId: 3,
      senderKey: 'u2',
    };

    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    const blocked = await chatbotRateLimitService.checkBeforeAi(params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('owner_cap');
    expect(await chatbotRateLimitService.getOwnerUsedToday(66)).toBe(3);
  });

  it('does not increment owner count when blocked by sender_minute', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '100';

    const params = {
      channel: 'web',
      ownerUserId: 77,
      chatbotId: 3,
      senderKey: 'spammer',
    };

    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    expect(await chatbotRateLimitService.getOwnerUsedToday(77)).toBe(1);

    const blocked = await chatbotRateLimitService.checkBeforeAi(params);
    expect(blocked.reason).toBe('sender_minute');
    expect(await chatbotRateLimitService.getOwnerUsedToday(77)).toBe(1);
  });

  it('counts owner usage on the no-senderKey branch', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '100';

    const params = {
      channel: 'web',
      ownerUserId: 88,
      chatbotId: 3,
      senderKey: '',
    };

    await chatbotRateLimitService.checkBeforeAi(params);
    await chatbotRateLimitService.checkBeforeAi(params);
    expect(await chatbotRateLimitService.getOwnerUsedToday(88)).toBe(2);
  });

  it('getOwnerUsedToday is read-only across repeated calls', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '100';
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '100';

    const params = {
      channel: 'web',
      ownerUserId: 99,
      chatbotId: 3,
      senderKey: 'u9',
    };
    await chatbotRateLimitService.checkBeforeAi(params);
    await chatbotRateLimitService.checkBeforeAi(params);

    expect(await chatbotRateLimitService.getOwnerUsedToday(99)).toBe(2);
    expect(await chatbotRateLimitService.getOwnerUsedToday(99)).toBe(2);
  });
});
