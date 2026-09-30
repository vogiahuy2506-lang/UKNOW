/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-4 -> viết lại theo P10 (PLAN_TG_WA_DAY_DU mục 17, 30/09/2026):
 * kênh adapter (Telegram/WhatsApp) có hạn mức tin/THÁNG RIÊNG (`plans.monthly_<kênh>_limit`), KHÔNG còn đếm chung vào Zalo.
 *
 * a) Zalo KHÔNG đếm ccm: 3 zalo_messages + 2 ccm telegram sent -> Zalo = 3, telegram (kỳ gói) = 2; +preview/failed/có reservation
 *    vẫn 2; +usage_logs telegram_direct_send -> 3; whatsapp không bị ảnh hưởng.
 * b) biên chu kỳ gói: ccm sent trước cycleStart KHÔNG tính; trong chu kỳ -> tính.
 * c) nhân viên: bộ đếm nhân viên Zalo KHÔNG cộng ccm của kênh adapter (TG/WA không áp trần nhân viên).
 * d) countCombinedSentInCycle(+WithLedger) VẪN cộng ccm (trần tổng messages_per_period không đổi); Zalo ledger = 0; email không đổi.
 * e) checkSendQuota({channel:'telegram'}) không còn ném; kênh lạ vẫn ném.
 * f) runner + cổng thật, mode off, plan monthly_telegram_limit=2 đã có 2 ccm telegram trong chu kỳ -> defer `plan_quota_monthly_telegram`,
 *    0 lần gửi; và plan có trần Zalo=1 nhưng Telegram không giới hạn -> vẫn gửi (không mượn cột Zalo).
 * g) mode test_enforce -> reservation kênh 'telegram' (CHECK chk_sqr_channel đã mở) consumed, ccm.quota_reservation_id khác NULL, đếm không đôi.
 * h) mode off + hết hạn mức gói + ví telegram_messages còn -> gửi được và ví bị trừ đúng 1 (source ccm:<id>); ví whatsapp không đụng.
 * i) CHECK ledger + ví: chèn reservation kênh telegram/whatsapp được, kênh lạ bị chặn; grant món tiêu hao có hạn (cycle_end) bị chặn.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { getBillingCycle } = await import('../../src/utils/billingCycle.util.js');
const {
  checkSendQuota,
  countZaloSentInCycleUncached,
  countEmployeeZaloSentToday,
  countEmployeeZaloSentThisMonth,
  countCombinedSentInCycle,
  countEmailSentInCycleUncached,
  countAdapterSentInCycleUncached,
  _clearQuotaCache,
} = await import('../../src/utils/userSendLimit.util.js');
const {
  countZaloSentInCycleWithLedger,
  countAdapterSentInCycleWithLedger,
  countEmployeeSentInCycleWithLedger,
} = await import('../../src/repositories/sendQuota.repository.js');

const MOCK_SUBTYPE = 'send_mock_quota_channel';
// Khoá kênh THẬT (`ccm.channel` = khoá hạn mức từ P10). Node dùng subtype giả để không cần adapter Telegram thật.
const CHANNEL = 'telegram';

let owner;
let fakeSendOne;
let originalQuotaGate;

function registerMockChannel(quotaChannel = CHANNEL) {
  campaignChannelRegistry.__registerChannelForTest({
    key: CHANNEL,
    sendNodeSubtype: MOCK_SUBTYPE,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel,
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: jest.fn().mockResolvedValue(),
      resolveAccount: jest.fn().mockResolvedValue({ accountKey: 'mock_account_1', display: 'Mock' }),
      resolveRecipients: async ({ rows }) => rows.map((row) => ({
        recipientKey: String(row.recipientKey || '').trim(),
        display: row.recipientKey,
        vars: {},
      })),
      sendOne: fakeSendOne,
      classifyError: (err) => err?.category || 'hard',
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  _clearQuotaCache();
  owner = await createUser({
    email: `pr4_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
  let msgIdSeq = 1;
  fakeSendOne = jest.fn().mockImplementation(async () => ({ messageId: `mock_msg_${msgIdSeq++}` }));
  campaignChannelRegistry.__resetTestChannels();
  registerMockChannel();
  originalQuotaGate = campaignRunService.channelQuotaGate;
});

afterEach(async () => {
  campaignChannelRegistry.__resetTestChannels();
  campaignRunService.channelQuotaGate = originalQuotaGate;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
  delete process.env.SEND_QUOTA_RESERVATION_MODE;
  _clearQuotaCache();
});

async function insertZaloMessageSent({ workspaceOwnerId, actorUserId = null }) {
  await db.query(
    `INSERT INTO zalo_messages (workspace_owner_id, actor_user_id, channel, tracking_metadata, is_preview, sent_at, created_at, updated_at, tracking_token)
     VALUES ($1, $2, 'zalo_personal', '{"status":"sent"}'::jsonb, false, now(), now(), now(), 'zpv_test_' || gen_random_uuid())`,
    [workspaceOwnerId, actorUserId]
  );
}

async function insertCcm({
  workspaceOwnerId,
  actorUserId = null,
  status = 'sent',
  isPreview = false,
  quotaReservationId = null,
  sentAtSql = 'now()',
  channel = CHANNEL,
}) {
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, channel, recipient_key, step_index, status, is_preview,
        quota_reservation_id, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'peer_ccm', 1, $4, $5, $6, ${sentAtSql}, now(), now())`,
    [workspaceOwnerId, actorUserId, channel, status, isPreview, quotaReservationId]
  );
}

async function insertUsageLog({ userId, resourceType, delta = 1 }) {
  await db.query(
    `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, metadata)
     VALUES ($1, $2, $3, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', '{}'::jsonb)`,
    [userId, resourceType, delta]
  );
}

async function createTestPlan(limits = {}) {
  const {
    dailyZalo = null, monthlyZalo = null, dailyEmail = null, monthlyEmail = null,
    monthlyTelegram = null, monthlyWhatsapp = null,
  } = limits;
  const { rows } = await db.query(
    `INSERT INTO plans (name, price, daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        monthly_telegram_limit, monthly_whatsapp_limit, is_active)
     VALUES ($1, 100000, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
    [`Plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, dailyEmail, monthlyEmail, dailyZalo, monthlyZalo,
      monthlyTelegram, monthlyWhatsapp]
  );
  return rows[0];
}

async function assignPlanToUser(userId, planId) {
  await db.query(
    `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '30 days', plan_activated_at = NOW() - INTERVAL '1 day' WHERE id = $2`,
    [planId, userId]
  );
}

async function cycleOf(userId) {
  const cycle = await getBillingCycle(userId);
  return { cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd };
}

async function createRunWithNode(name, recipientKeys = ['peer1']) {
  const { rows: campaignRows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, 'email', 'active') RETURNING id`,
    [owner.id, name]
  );
  const campaignId = campaignRows[0].id;
  const { rows: nodeRows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING id`,
    [
      campaignId,
      MOCK_SUBTYPE,
      JSON.stringify({ recipientSource: 'manual', recipientKeys, steps: [{ message: 'Bước 1' }] }),
    ]
  );
  const { rows: runRows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
    [campaignId, owner.id]
  );
  return { campaignId, nodeId: nodeRows[0].id, run: runRows[0] };
}

describe('P10 — kênh adapter có hạn mức tin/tháng RIÊNG (campaign_channel_messages KHÔNG còn đếm vào Zalo)', () => {
  it('(a) Zalo không đếm ccm; telegram đếm ccm sent + usage_logs telegram_direct_send, loại preview/failed/có reservation; whatsapp độc lập', async () => {
    const plan = await createTestPlan();
    await assignPlanToUser(owner.id, plan.id);
    const { cycleStart, cycleEnd } = await cycleOf(owner.id);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    }
    await insertCcm({ workspaceOwnerId: owner.id });
    await insertCcm({ workspaceOwnerId: owner.id });

    expect(await countZaloSentInCycleUncached(owner.id, cycleStart, cycleEnd)).toBe(3);
    expect(await countZaloSentInCycleWithLedger(db, owner.id, cycleStart, cycleEnd)).toBe(3);
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleUncached(owner.id, 'whatsapp', cycleStart, cycleEnd)).toBe(0);

    await insertCcm({ workspaceOwnerId: owner.id, isPreview: true });
    await insertCcm({ workspaceOwnerId: owner.id, status: 'failed' });
    await insertCcm({ workspaceOwnerId: owner.id, quotaReservationId: 999999 });
    await insertCcm({ workspaceOwnerId: owner.id, channel: 'whatsapp' });

    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(2);
    expect(await countAdapterSentInCycleUncached(owner.id, 'whatsapp', cycleStart, cycleEnd)).toBe(1);

    // Gửi nhanh: dòng ccm is_preview + usage_logs -> chỉ đi qua usage_logs, đúng loại kênh.
    await insertUsageLog({ userId: owner.id, resourceType: 'telegram_direct_send' });
    await insertUsageLog({ userId: owner.id, resourceType: 'zalo_direct_send' });
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(3);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(3);
    expect(await countZaloSentInCycleUncached(owner.id, cycleStart, cycleEnd)).toBe(4); // + 1 zalo_direct_send
  });

  it('(b) biên chu kỳ GÓI: ccm trước cycleStart không tính, trong chu kỳ tính', async () => {
    const plan = await createTestPlan();
    await assignPlanToUser(owner.id, plan.id);
    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    await insertCcm({ workspaceOwnerId: owner.id, sentAtSql: `'${cycleStart.toISOString()}'::timestamptz - interval '1 minute'` });
    await insertCcm({ workspaceOwnerId: owner.id, sentAtSql: `'${cycleStart.toISOString()}'::timestamptz + interval '1 minute'` });
    expect(await countAdapterSentInCycleUncached(owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
  });

  it('(c) bộ đếm nhân viên Zalo KHÔNG cộng ccm của kênh adapter', async () => {
    const employee = await createUser({
      email: `pr4_emp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
    await insertCcm({ workspaceOwnerId: owner.id, actorUserId: employee.id });
    await insertZaloMessageSent({ workspaceOwnerId: owner.id, actorUserId: employee.id });

    const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    expect(await countEmployeeZaloSentToday(owner.id, employee.id)).toBe(1);
    expect(await countEmployeeZaloSentThisMonth(owner.id, employee.id, cycleStart, cycleEnd)).toBe(1);
    expect(await countEmployeeSentInCycleWithLedger(db, owner.id, employee.id, 'zalo', cycleStart, cycleEnd)).toBe(1);
  });

  it('(d) trần TỔNG theo kỳ vẫn cộng ccm; Zalo ledger = 0 (không còn mượn); email không đổi', async () => {
    const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

    await db.query(
      `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
       VALUES ($1, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
      [owner.id]
    );
    const beforeEmail = await countEmailSentInCycleUncached(owner.id, cycleStart, cycleEnd);
    expect(await countCombinedSentInCycle(owner.id, cycleStart, cycleEnd)).toBe(1);

    await insertCcm({ workspaceOwnerId: owner.id });
    await insertCcm({ workspaceOwnerId: owner.id, channel: 'whatsapp' });

    _clearQuotaCache();
    expect(await countCombinedSentInCycle(owner.id, cycleStart, cycleEnd)).toBe(3);
    expect(await countEmailSentInCycleUncached(owner.id, cycleStart, cycleEnd)).toBe(beforeEmail);
    expect(await countZaloSentInCycleWithLedger(db, owner.id, cycleStart, cycleEnd)).toBe(0);
    expect(await countZaloSentInCycleUncached(owner.id, cycleStart, cycleEnd)).toBe(0);
  });

  it('(e) checkSendQuota telegram/whatsapp không còn ném; kênh lạ vẫn ném', async () => {
    const plan = await createTestPlan({ monthlyTelegram: 5, monthlyWhatsapp: 5 });
    await assignPlanToUser(owner.id, plan.id);
    _clearQuotaCache();
    expect((await checkSendQuota({ userId: owner.id, channel: 'telegram' })).allowed).toBe(true);
    expect((await checkSendQuota({ userId: owner.id, channel: 'whatsapp' })).allowed).toBe(true);
    await expect(checkSendQuota({ userId: owner.id, channel: 'viber' })).rejects.toThrow(/kênh không hợp lệ/i);
  });

  it('(f) runner + cổng thật, mode off: chạm trần Telegram -> defer plan_quota_monthly_telegram, 0 lần gửi; trần Zalo thấp KHÔNG chặn Telegram', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 2, monthlyZalo: 1000 });
    await assignPlanToUser(owner.id, plan.id);
    await insertCcm({ workspaceOwnerId: owner.id });
    await insertCcm({ workspaceOwnerId: owner.id });
    _clearQuotaCache();

    const { campaignId, run } = await createRunWithNode('P10 telegram chạm trần');
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);
    const { rows: afterRun } = await db.query(
      'SELECT status, run_metadata, total_recipients, successful_sends, failed_sends, skipped_sends FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    expect(afterRun[0].status).toBe('running');
    expect(afterRun[0].run_metadata.quotaDeferredReason).toBe('plan_quota_monthly_telegram');
    expect(afterRun[0].run_metadata.quotaDeferredUntil).toBeTruthy();
    const { total_recipients: total, successful_sends: ok, failed_sends: bad, skipped_sends: sk } = afterRun[0];
    expect(ok + bad + sk).toBeLessThanOrEqual(total);

    // Trần Zalo = 1 và đã dùng hết, Telegram không giới hạn -> vẫn gửi (không mượn cột Zalo).
    await truncateAll();
    _clearQuotaCache();
    owner = await createUser({ email: `pr4_owner2_${Date.now()}@example.com` });
    const plan2 = await createTestPlan({ monthlyZalo: 1, monthlyTelegram: null });
    await assignPlanToUser(owner.id, plan2.id);
    await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    _clearQuotaCache();
    const second = await createRunWithNode('P10 telegram không giới hạn');
    await campaignRunService.executeCampaign(second.campaignId, second.run.id, owner.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(1);
  });

  it('(g) mode test_enforce -> reservation kênh telegram consumed (CHECK đã mở), ccm gắn reservation, đếm không đôi', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'test_enforce';
    const plan = await createTestPlan({ monthlyTelegram: 100 });
    await assignPlanToUser(owner.id, plan.id);
    _clearQuotaCache();

    const { campaignId, nodeId, run } = await createRunWithNode('P10 enforce');
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(1);
    const { rows: ccmRows } = await db.query(
      `SELECT status, quota_reservation_id FROM campaign_channel_messages WHERE id_run = $1 AND id_node = $2`,
      [run.id, nodeId]
    );
    expect(ccmRows).toHaveLength(1);
    expect(ccmRows[0].status).toBe('sent');
    expect(ccmRows[0].quota_reservation_id).not.toBeNull();

    const { rows: reservationRows } = await db.query(
      `SELECT status, channel FROM send_quota_reservations WHERE id = $1`,
      [ccmRows[0].quota_reservation_id]
    );
    expect(reservationRows[0]).toEqual({ status: 'consumed', channel: 'telegram' });

    const { cycleStart, cycleEnd } = await cycleOf(owner.id);
    expect(await countAdapterSentInCycleWithLedger(db, owner.id, 'telegram', cycleStart, cycleEnd)).toBe(1);
    expect(await countZaloSentInCycleWithLedger(db, owner.id, cycleStart, cycleEnd)).toBe(0);
  });

  it('(h) mode off + hết hạn mức gói + ví telegram_messages còn: gửi được, ví bị trừ đúng 1 (source ccm:<id>); ví whatsapp không đụng', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ monthlyTelegram: 1, monthlyWhatsapp: 1 });
    await assignPlanToUser(owner.id, plan.id);
    await insertCcm({ workspaceOwnerId: owner.id }); // đã dùng hết 1/1
    const { rows: orderRows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 50000) RETURNING id`,
      [owner.id, Date.now()]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1, 'telegram_messages', 5, $2, NULL)`,
      [owner.id, orderRows[0].id]
    );
    _clearQuotaCache();

    const { campaignId, run } = await createRunWithNode('P10 ví telegram');
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(1);
    const { rows: ccmRows } = await db.query(
      `SELECT id FROM campaign_channel_messages WHERE id_run = $1 AND status = 'sent'`,
      [run.id]
    );
    const { rows: debits } = await db.query(
      `SELECT item_key, qty, source_key FROM topup_debits WHERE user_id = $1`,
      [owner.id]
    );
    expect(debits).toEqual([{ item_key: 'telegram_messages', qty: 1, source_key: `ccm:${ccmRows[0].id}` }]);
  });

  it('(i) CHECK ledger: kênh telegram/whatsapp + món ví mới hợp lệ, kênh lạ bị chặn; món tiêu hao mới không được có hạn', async () => {
    const baseInsert = (channel, walletQty = 0, walletItem = null) => db.query(
      `INSERT INTO send_quota_reservations
         (reservation_key, request_fingerprint, billing_user_id, channel, quantity, wallet_item_key, wallet_quantity,
          source_type, status, vn_day_start, vn_day_end)
       VALUES ($1, $2, $3, $4, 2, $5, $6, 'campaign_zalo', 'reserved', now(), now() + interval '1 day')`,
      [`test_res_${channel}_${walletQty}_${Math.random().toString(36).slice(2, 8)}`, 'a'.repeat(64), owner.id, channel, walletItem, walletQty]
    );
    await expect(baseInsert('telegram')).resolves.toBeTruthy();
    await expect(baseInsert('whatsapp')).resolves.toBeTruthy();
    await expect(baseInsert('telegram', 1, 'telegram_messages')).resolves.toBeTruthy();
    await expect(baseInsert('whatsapp', 1, 'whatsapp_messages')).resolves.toBeTruthy();
    await expect(baseInsert('viber')).rejects.toThrow(/chk_sqr_channel/);

    const { rows: orderRows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 50000) RETURNING id`,
      [owner.id, Date.now() + 1]
    );
    await expect(db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1, 'whatsapp_messages', 5, $2, now() + interval '1 day')`,
      [owner.id, orderRows[0].id]
    )).rejects.toThrow(/topup_grants_consumable_no_expiry/);
  });
});
