/**
 * P11 (PLAN_TG_WA_DAY_DU mục 18) — Hộp thư trả lời tay Telegram/WhatsApp tính vào hạn mức tin/tháng của kênh đó.
 *
 * a) Bộ đếm: tin agent `manual_inbox` có `metadata.send.status='sent'` của kết nối Hộp thư `telegram` được cộng vào Telegram;
 *    kết nối `whatsapp_baileys` cộng vào WhatsApp (KHÔNG so `= 'whatsapp'`). Tin failed / chưa có send / không phải manual_inbox /
 *    role khách / ngoài chu kỳ / chủ khác đều KHÔNG đếm. Cả hai hàm đếm (legacy + ledger) và tổng kỳ.
 * b) checkSendQuota({channel:'telegram'}) chặn khi Hộp thư đã dùng hết trần.
 * c) Luồng thật `sendMessage` (adapter giả, mode off): gửi OK → đếm + ví KHÔNG trừ khi còn trong gói; hết trần + ví còn → gửi được và
 *    ví trừ đúng 1 (source cm:<id>); hết trần + ví hết → bị chặn, không lưu tin, không gọi adapter; tin lỗi không được đếm/không trừ ví.
 * d) Mode test_enforce: đặt chỗ kênh 'telegram' consumed, dòng tin gắn quota_reservation_id, đếm không đôi (ledger).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const mockTelegramSend = jest.fn();
const mockWhatsappSend = jest.fn();
jest.unstable_mockModule('../../src/services/chatbot/channelAdapters/telegramInbox.adapter.js', () => ({
  default: { sendReply: mockTelegramSend },
}));
jest.unstable_mockModule('../../src/services/chatbot/channelAdapters/whatsappBaileysInbox.adapter.js', () => ({
  default: { sendReply: mockWhatsappSend },
}));

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { getBillingCycle } = await import('../../src/utils/billingCycle.util.js');
const unifiedInboxService = (await import('../../src/services/chatbot/unifiedInbox.service.js')).default;
const {
  checkSendQuota,
  countAdapterSentInCycleUncached,
  countCombinedSentInCycle,
  _clearQuotaCache,
} = await import('../../src/utils/userSendLimit.util.js');
const {
  countAdapterSentInCycleWithLedger,
  countCombinedSentInCycleWithLedger,
} = await import('../../src/repositories/sendQuota.repository.js');

let owner;
let other;

beforeEach(async () => {
  await truncateAll();
  _clearQuotaCache();
  mockTelegramSend.mockReset();
  mockWhatsappSend.mockReset();
  mockTelegramSend.mockResolvedValue({ success: true, messageId: 'tg_1', provider: 'telegram' });
  mockWhatsappSend.mockResolvedValue({ success: true, messageId: 'wa_1', provider: 'baileys' });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  owner = await createUser({ email: `p11_owner_${suffix}@example.com` });
  other = await createUser({ email: `p11_other_${suffix}@example.com` });
});

afterEach(() => {
  delete process.env.SEND_QUOTA_RESERVATION_MODE;
  _clearQuotaCache();
});

async function createTestPlan({ monthlyTelegram = null, monthlyWhatsapp = null } = {}) {
  const { rows } = await db.query(
    `INSERT INTO plans (name, price, monthly_telegram_limit, monthly_whatsapp_limit, is_active)
     VALUES ($1, 100000, $2, $3, true) RETURNING *`,
    [`Plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, monthlyTelegram, monthlyWhatsapp]
  );
  return rows[0];
}

async function assignPlan(userId, planId) {
  await db.query(
    `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '30 days',
            plan_activated_at = NOW() - INTERVAL '1 day' WHERE id = $2`,
    [planId, userId]
  );
}

async function cycleOf(userId) {
  const cycle = await getBillingCycle(userId);
  return { cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd };
}

/** Kết nối Hộp thư + một hội thoại. `channel` là kênh HỘP THƯ ('telegram' | 'whatsapp_baileys'). */
async function seedConversation(userId, channel, externalId) {
  const { rows: conn } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, display_name, external_channel_id)
     VALUES ($1, $2, $2, $3) RETURNING id`,
    [userId, channel, `ext_${channel}_${userId}`]
  );
  const { rows: conv } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, $3, $4, 'Khách') RETURNING id`,
    [userId, conn[0].id, channel, externalId]
  );
  return { connectionId: conn[0].id, conversationId: conv[0].id };
}

async function insertChannelMessage({
  userId, connectionId, conversationId, role = 'agent', source = 'manual_inbox', sendStatus = 'sent',
  quotaReservationId = null, createdSql = 'now()',
}) {
  const metadata = { ...(source ? { source } : {}), ...(sendStatus ? { send: { status: sendStatus } } : {}) };
  const { rows } = await db.query(
    `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, metadata, quota_reservation_id, created_at)
     VALUES ($1, $2, $3, $4, 'xin chào', $5::jsonb, $6, ${createdSql}) RETURNING id`,
    [conversationId, userId, connectionId, role, JSON.stringify(metadata), quotaReservationId]
  );
  return rows[0].id;
}

describe('P11 — bộ đếm Hộp thư Telegram/WhatsApp', () => {
  it('(a) chỉ đếm tin agent manual_inbox đã sent, đúng kênh Hộp thư (whatsapp_baileys → whatsapp), đúng chủ và chu kỳ', async () => {
    const plan = await createTestPlan();
    await assignPlan(owner.id, plan.id);
    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    const wa = await seedConversation(owner.id, 'whatsapp_baileys', 'wa:1:8490@s.whatsapp.net');
    const otherTg = await seedConversation(other.id, 'telegram', 'telegram:2:200');

    await insertChannelMessage({ userId: owner.id, ...tg });
    await insertChannelMessage({ userId: owner.id, ...tg });
    await insertChannelMessage({ userId: owner.id, ...wa });

    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleUncached(owner.id, 'whatsapp', cycleStart, cycleEnd)).toBe(1);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'whatsapp', cycleStart, cycleEnd)).toBe(1);

    // Không đếm: failed, chưa có send (mới chèn), không phải manual_inbox (AI trả lời), role khách, ngoài chu kỳ, có reservation, chủ khác.
    await insertChannelMessage({ userId: owner.id, ...tg, sendStatus: 'failed' });
    await insertChannelMessage({ userId: owner.id, ...tg, sendStatus: null });
    await insertChannelMessage({ userId: owner.id, ...tg, sendStatus: 'retrying' });
    await insertChannelMessage({ userId: owner.id, ...tg, source: null });
    await insertChannelMessage({ userId: owner.id, ...tg, role: 'user', source: null });
    await insertChannelMessage({ userId: owner.id, ...tg, createdSql: `now() - interval '40 days'` });
    await insertChannelMessage({ userId: other.id, ...otherTg });

    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);

    // Có reservation → ledger send_quota_reservations đếm, dòng tin không đếm lần hai.
    await insertChannelMessage({ userId: owner.id, ...tg, quotaReservationId: 424242 });
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);

    // Tổng kỳ (messages_per_period) cộng cả Hộp thư Telegram + WhatsApp: 2 + 1 = 3, hai hàm đếm khớp nhau.
    _clearQuotaCache();
    expect(await countCombinedSentInCycle(owner.id, cycleStart, cycleEnd)).toBe(3);
    expect(await countCombinedSentInCycleWithLedger(db, owner.id, cycleStart, cycleEnd)).toBe(3);
  });

  it('(b) checkSendQuota telegram chặn khi Hộp thư đã dùng hết trần gói; whatsapp độc lập', async () => {
    const plan = await createTestPlan({ monthlyTelegram: 1, monthlyWhatsapp: 5 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    _clearQuotaCache();
    expect((await checkSendQuota({ userId: owner.id, channel: 'telegram' })).allowed).toBe(true);

    await insertChannelMessage({ userId: owner.id, ...tg });
    _clearQuotaCache();
    const blocked = await checkSendQuota({ userId: owner.id, channel: 'telegram' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toMatch(/Telegram/);
    expect((await checkSendQuota({ userId: owner.id, channel: 'whatsapp' })).allowed).toBe(true);
  });
});

describe('P11 — luồng thật sendMessage (adapter giả)', () => {
  async function grantWallet(userId, itemKey, qty) {
    const { rows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 50000) RETURNING id`,
      [userId, Date.now() + Math.floor(Math.random() * 1000)]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1, $2, $3, $4, NULL)`,
      [userId, itemKey, qty, rows[0].id]
    );
  }

  it('(c1) còn trong gói: gửi OK, tin được đếm, KHÔNG trừ ví', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 5 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    await grantWallet(owner.id, 'telegram_messages', 3);
    _clearQuotaCache();

    const result = await unifiedInboxService.sendMessage(owner.id, tg.conversationId, 'channel', 'Chào bạn');
    expect(result.sendStatus).toBe('sent');
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);

    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    _clearQuotaCache();
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
    const { rows: debits } = await db.query('SELECT * FROM topup_debits WHERE user_id = $1', [owner.id]);
    expect(debits).toHaveLength(0);
  });

  it('(c2) hết trần gói + ví còn: gửi được, ví trừ đúng 1 với source cm:<id>; ví whatsapp không đụng', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 1, monthlyWhatsapp: 1 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    await insertChannelMessage({ userId: owner.id, ...tg }); // đã dùng 1/1
    await grantWallet(owner.id, 'telegram_messages', 5);
    await grantWallet(owner.id, 'whatsapp_messages', 5);
    _clearQuotaCache();

    const result = await unifiedInboxService.sendMessage(owner.id, tg.conversationId, 'channel', 'Chào bạn');
    expect(result.sendStatus).toBe('sent');

    const { rows: debits } = await db.query('SELECT item_key, qty, source_key FROM topup_debits WHERE user_id = $1', [owner.id]);
    expect(debits).toEqual([{ item_key: 'telegram_messages', qty: 1, source_key: `cm:${result.messageId}` }]);
  });

  it('(c3) hết trần gói + ví hết: bị chặn, KHÔNG lưu tin, KHÔNG gọi adapter', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 1 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    await insertChannelMessage({ userId: owner.id, ...tg });
    _clearQuotaCache();

    await expect(unifiedInboxService.sendMessage(owner.id, tg.conversationId, 'channel', 'Chào bạn'))
      .rejects.toMatchObject({ code: expect.any(String) });
    expect(mockTelegramSend).not.toHaveBeenCalled();
    const { rows } = await db.query('SELECT count(*)::int AS n FROM channel_messages WHERE id_conversation = $1', [tg.conversationId]);
    expect(rows[0].n).toBe(1);
  });

  it('(c4) adapter lỗi: tin failed KHÔNG được đếm và KHÔNG trừ ví; gửi lại OK mới đếm + trừ ví (cm:<id>)', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 1 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    await insertChannelMessage({ userId: owner.id, ...tg }); // dùng 1/1 → mọi tin sau phải qua ví
    await grantWallet(owner.id, 'telegram_messages', 5);
    _clearQuotaCache();
    mockTelegramSend.mockResolvedValueOnce({ success: false, error: 'Telegram account 7 is inactive' });

    const failed = await unifiedInboxService.sendMessage(owner.id, tg.conversationId, 'channel', 'Chào bạn');
    expect(failed.sendStatus).toBe('failed');
    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    _clearQuotaCache();
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
    expect(await db.query('SELECT 1 FROM topup_debits WHERE user_id = $1', [owner.id]).then((r) => r.rowCount)).toBe(0);

    _clearQuotaCache();
    const retried = await unifiedInboxService.retryMessage(owner.id, failed.messageId, 'channel');
    expect(retried.sendStatus).toBe('sent');
    _clearQuotaCache();
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    const { rows: debits } = await db.query('SELECT item_key, qty, source_key FROM topup_debits WHERE user_id = $1', [owner.id]);
    expect(debits).toEqual([{ item_key: 'telegram_messages', qty: 1, source_key: `cm:${failed.messageId}` }]);
  });

  it('(c5) WhatsApp (whatsapp_baileys) hết trần WhatsApp → chặn; trần Telegram không liên quan', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 100, monthlyWhatsapp: 1 });
    await assignPlan(owner.id, plan.id);
    const wa = await seedConversation(owner.id, 'whatsapp_baileys', 'wa:1:8490@s.whatsapp.net');
    await insertChannelMessage({ userId: owner.id, ...wa });
    _clearQuotaCache();

    await expect(unifiedInboxService.sendMessage(owner.id, wa.conversationId, 'channel', 'Chào bạn')).rejects.toBeTruthy();
    expect(mockWhatsappSend).not.toHaveBeenCalled();
  });

  it('(d) mode test_enforce: đặt chỗ kênh telegram consumed, dòng tin gắn quota_reservation_id, đếm ledger không đôi', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'test_enforce';
    const plan = await createTestPlan({ monthlyTelegram: 100 });
    await assignPlan(owner.id, plan.id);
    const tg = await seedConversation(owner.id, 'telegram', 'telegram:1:100');
    _clearQuotaCache();

    const result = await unifiedInboxService.sendMessage(owner.id, tg.conversationId, 'channel', 'Chào bạn');
    expect(result.sendStatus).toBe('sent');

    const { rows } = await db.query('SELECT quota_reservation_id FROM channel_messages WHERE id = $1', [result.messageId]);
    expect(rows[0].quota_reservation_id).not.toBeNull();
    const { rows: res } = await db.query('SELECT status, channel FROM send_quota_reservations WHERE id = $1', [rows[0].quota_reservation_id]);
    expect(res[0]).toEqual({ status: 'consumed', channel: 'telegram' });

    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
  });
});
