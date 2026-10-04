import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
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

  it('applies a per-chatbot minute rule across senders and stays silent when configured', async () => {
    chatbotRateLimitService._setChatbotConfigForTests(123, {
      windows: {
        minute: { limit: 2, action: 'silent' },
      },
    });

    const base = { channel: 'web', ownerUserId: 7, chatbotId: 123 };
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'a' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'b' })).allowed).toBe(true);

    const blocked = await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'c' });
    expect(blocked).toMatchObject({
      allowed: false,
      reason: 'custom_minute',
      shouldNotify: false,
      staticReply: '',
    });
  });

  it('uses a custom notice once for the configured window', async () => {
    chatbotRateLimitService._setChatbotConfigForTests(321, {
      windows: {
        month: { limit: 1, action: 'notify', message: 'Bot đã hết lượt tháng này.' },
      },
    });

    const params = { channel: 'zalo_oa', ownerUserId: 8, chatbotId: 321, senderKey: 'visitor' };
    expect((await chatbotRateLimitService.checkBeforeAi(params)).allowed).toBe(true);
    const firstBlock = await chatbotRateLimitService.checkBeforeAi(params);
    expect(firstBlock).toMatchObject({
      reason: 'custom_month',
      shouldNotify: true,
      staticReply: 'Bot đã hết lượt tháng này.',
    });

    await chatbotRateLimitService.markRateLimitNotified({ ...params, reason: 'custom_month' });
    expect((await chatbotRateLimitService.checkBeforeAi(params)).shouldNotify).toBe(false);
  });

  it('keeps custom counters isolated per chatbot', async () => {
    const config = { windows: { hour: { limit: 1, action: 'silent' } } };
    chatbotRateLimitService._setChatbotConfigForTests(41, config);
    chatbotRateLimitService._setChatbotConfigForTests(42, config);

    const base = { channel: 'web', ownerUserId: 9, senderKey: 'same-user' };
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, chatbotId: 41 })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, chatbotId: 41 })).reason).toBe('custom_hour');
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, chatbotId: 42 })).allowed).toBe(true);
  });

  it('does not apply the deprecated owner cap once the per-chatbot schema is available', async () => {
    chatbotRateLimitService._setOwnerCapForTests(90, 1);
    chatbotRateLimitService._setChatbotConfigForTests(50, { windows: {} });

    const base = { channel: 'web', ownerUserId: 90, chatbotId: 50 };
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'a' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkBeforeAi({ ...base, senderKey: 'b' })).allowed).toBe(true);
  });
});

// A P0-4 (PLAN_SUA_AI_DOT4_PR5): trần chat CÔNG KHAI khoá theo IP + chatbot và tổng theo chatbot — không có sessionId nào
// trong chữ ký `checkPublicVisitor`, nên client đổi sessionId thế nào cũng không né được.
describe('chatbotRateLimit.service — checkPublicVisitor (trần chat công khai không phụ thuộc client)', () => {
  const ENV_KEYS = ['PUBLIC_CHAT_PER_IP_PER_10MIN', 'PUBLIC_CHAT_PER_IP_PER_DAY', 'PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT'];

  beforeEach(() => {
    chatbotRateLimitService._resetMemoryForTests();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  const hit = async (scope, times) => {
    for (let i = 0; i < times; i++) await chatbotRateLimitService.checkPublicVisitor(scope);
  };

  it('mặc định: 20 tin / 10 phút / (IP + chatbot) — tin 21 bị chặn public_ip_burst', async () => {
    const scope = { chatbotId: 7, ipKey: '203.0.113.5' };
    for (let i = 0; i < 20; i++) {
      expect((await chatbotRateLimitService.checkPublicVisitor(scope)).allowed).toBe(true);
    }
    const blocked = await chatbotRateLimitService.checkPublicVisitor(scope);
    expect(blocked).toMatchObject({ allowed: false, reason: 'public_ip_burst', limit: 20 });
  });

  it('hai IP khác nhau KHÔNG chung trần; cùng IP nhưng chatbot khác cũng không chung', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '2';
    await hit({ chatbotId: 7, ipKey: '203.0.113.5' }, 2);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '203.0.113.5' })).allowed).toBe(false);

    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '203.0.113.6' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 8, ipKey: '203.0.113.5' })).allowed).toBe(true);
  });

  it('mặc định: 100 tin / ngày / (IP + chatbot) — chặn public_ip_day dù cửa sổ 10 phút còn trống', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '100000';
    process.env.PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT = '100000';
    const scope = { chatbotId: 7, ipKey: '203.0.113.5' };
    await hit(scope, 100);
    const blocked = await chatbotRateLimitService.checkPublicVisitor(scope);
    expect(blocked).toMatchObject({ allowed: false, reason: 'public_ip_day', limit: 100 });
  });

  it('mặc định: 300 tin khách / ngày / chatbot, TỔNG mọi IP — IP thứ 301 bị chặn public_chatbot_day dù IP đó chưa từng gửi', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '100000';
    process.env.PUBLIC_CHAT_PER_IP_PER_DAY = '100000';
    for (let i = 0; i < 300; i++) {
      expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: `10.1.${Math.floor(i / 250)}.${i % 250}` })).allowed).toBe(true);
    }
    const blocked = await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '198.51.100.99' });
    expect(blocked).toMatchObject({ allowed: false, reason: 'public_chatbot_day', limit: 300 });
    // Chatbot khác trong cùng ngày không bị ảnh hưởng.
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 8, ipKey: '198.51.100.99' })).allowed).toBe(true);
  });

  it('đọc PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT từ env', async () => {
    process.env.PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT = '2';
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 9, ipKey: 'a' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 9, ipKey: 'b' })).allowed).toBe(true);
    expect(await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 9, ipKey: 'c' })).toMatchObject({
      allowed: false,
      reason: 'public_chatbot_day',
      limit: 2,
    });
  });

  it('một IP bị chặn KHÔNG ăn dần trần chung của chatbot (kẻ lạ không làm cạn trần ngày của khách thật)', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '3';
    process.env.PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT = '5';
    const attacker = { chatbotId: 7, ipKey: '203.0.113.5' };
    await hit(attacker, 3); // 3 tin qua, đã cộng 3 vào trần chatbot
    for (let i = 0; i < 50; i++) {
      expect((await chatbotRateLimitService.checkPublicVisitor(attacker)).reason).toBe('public_ip_burst');
    }
    // Trần chatbot mới dùng 3/5: khách thật còn 2 tin.
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '198.51.100.1' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '198.51.100.2' })).allowed).toBe(true);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: '198.51.100.3' })).reason).toBe('public_chatbot_day');
  });

  it('thiếu ipKey / chatbotId không làm hở trần: dồn vào một thùng chung "unknown"', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '2';
    await hit({ chatbotId: 7, ipKey: '' }, 2);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: 7, ipKey: undefined })).allowed).toBe(false);
    await hit({ chatbotId: undefined, ipKey: 'x' }, 2);
    expect((await chatbotRateLimitService.checkPublicVisitor({ chatbotId: null, ipKey: 'x' })).allowed).toBe(false);
  });

  it('giá trị env sai (chữ, 0, âm) → rơi về mặc định, không tắt trần', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = 'abc';
    process.env.PUBLIC_CHAT_PER_IP_PER_DAY = '0';
    process.env.PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT = '-5';
    expect(chatbotRateLimitService.publicPerIpPer10Min).toBe(20);
    expect(chatbotRateLimitService.publicPerIpPerDay).toBe(100);
    expect(chatbotRateLimitService.publicDailyCapPerChatbot).toBe(300);
  });
});
