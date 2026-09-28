/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-4 — Quota tường minh cho kênh adapter.
 *
 * a) owner có 3 zalo_messages sent + 2 ccm sent (reservation NULL) hôm nay → count = 5 (cả 2 hàm);
 *    +1 ccm preview, 1 ccm failed, 1 ccm có quota_reservation_id → vẫn 5.
 * b) ccm sent 23:30 VN hôm qua → KHÔNG tính hôm nay; ccm 00:30 VN hôm nay → tính.
 * c) employee: ccm actor_user_id = nhân viên → tính; nhân viên khác → không.
 * d) countCombinedSentInCycle(+WithLedger) cộng ccm; email count không đổi.
 * e) checkSendQuota({channel:'telegram'}) → throw.
 * f) runner + gate thật, mode off, plan daily_zalo_limit=2, đã có 2 zalo_messages hôm nay →
 *    reserve ném PLAN_SEND_LIMIT_EXCEEDED, 0 lần sendOne, partialResult giữ bất biến. ĐỔI Ở PR-5:
 *    daily limit luôn có resetAt (nextVnMidnight()) nên giờ run DEFER (quotaDeferredUntil, vẫn
 *    'running') thay vì 'failed' — trước PR-5 test này kỳ vọng 'failed'.
 * g) mode enforce → ccm.quota_reservation_id khác NULL, reservation consumed, count không đôi.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { createNoopChannelQuotaGate } = await import('../../src/services/campaign/campaignChannelRunner.service.js');
const {
  checkSendQuota,
  countZaloSentToday,
  countZaloSentInCycleUncached,
  countEmployeeZaloSentToday,
  countEmployeeZaloSentThisMonth,
  countCombinedSentInCycle,
  countEmailSentInCycleUncached,
  _clearQuotaCache,
} = await import('../../src/utils/userSendLimit.util.js');
const {
  countZaloSentTodayWithLedger,
  countZaloSentInCycleWithLedger,
  countEmployeeSentTodayWithLedger,
  countEmployeeSentInCycleWithLedger,
} = await import('../../src/repositories/sendQuota.repository.js');
const { getVnDayBoundaries } = await import('../../src/services/quota/sendQuotaReservation.service.js');

const MOCK_SUBTYPE = 'send_mock_quota_channel';
const MOCK_KEY = 'mock_quota_channel';

let owner;
let fakeSendOne;
let originalQuotaGate;

function registerMockChannel() {
  campaignChannelRegistry.__registerChannelForTest({
    key: MOCK_KEY,
    sendNodeSubtype: MOCK_SUBTYPE,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
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

async function insertZaloMessageSent({ workspaceOwnerId, actorUserId = null, sentAtSql = 'now()' }) {
  await db.query(
    `INSERT INTO zalo_messages (workspace_owner_id, actor_user_id, channel, tracking_metadata, is_preview, sent_at, created_at, updated_at, tracking_token)
     VALUES ($1, $2, 'zalo_personal', '{"status":"sent"}'::jsonb, false, ${sentAtSql}, now(), now(), 'zpv_test_' || gen_random_uuid())`,
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
  channel = MOCK_KEY,
}) {
  await db.query(
    `INSERT INTO campaign_channel_messages
       (workspace_owner_id, actor_user_id, channel, recipient_key, step_index, status, is_preview,
        quota_reservation_id, sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'peer_ccm', 1, $4, $5, $6, ${sentAtSql}, now(), now())`,
    [workspaceOwnerId, actorUserId, channel, status, isPreview, quotaReservationId]
  );
}

async function createTestPlan(limits = {}) {
  const { dailyZalo = null, monthlyZalo = null, dailyEmail = null, monthlyEmail = null } = limits;
  const { rows } = await db.query(
    `INSERT INTO plans (name, price, daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit, is_active)
     VALUES ($1, 100000, $2, $3, $4, $5, true) RETURNING *`,
    [`Plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, dailyEmail, monthlyEmail, dailyZalo, monthlyZalo]
  );
  return rows[0];
}

async function assignPlanToUser(userId, planId) {
  await db.query(
    `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '30 days' WHERE id = $2`,
    [planId, userId]
  );
}

describe('PR-4 — Quota tường minh cho kênh adapter (campaign_channel_messages đếm vào limit Zalo)', () => {
  it('(a) 3 zalo_messages sent + 2 ccm sent hôm nay -> count = 5; +preview/failed/có reservation -> vẫn 5', async () => {
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    }
    await insertCcm({ workspaceOwnerId: owner.id });
    await insertCcm({ workspaceOwnerId: owner.id });

    const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
    expect(await countZaloSentToday(owner.id)).toBe(5);
    expect(await countZaloSentTodayWithLedger(db, owner.id, vnDayStart, vnDayEnd)).toBe(5);

    await insertCcm({ workspaceOwnerId: owner.id, isPreview: true });
    await insertCcm({ workspaceOwnerId: owner.id, status: 'failed' });
    await insertCcm({ workspaceOwnerId: owner.id, quotaReservationId: 999999 });

    _clearQuotaCache();
    expect(await countZaloSentToday(owner.id)).toBe(5);
    expect(await countZaloSentTodayWithLedger(db, owner.id, vnDayStart, vnDayEnd)).toBe(5);
  });

  it('(b) ccm sent 23:30 VN hôm qua KHÔNG tính hôm nay; ccm 00:30 VN hôm nay tính', async () => {
    // now() phiên DB chạy theo timezone Asia/Ho_Chi_Minh (config/database.js) — chèn giờ tường minh
    // bằng chuỗi ::timestamptz +07 để không phụ thuộc "hôm nay" của máy chạy test thật.
    await db.query(
      `INSERT INTO campaign_channel_messages
         (workspace_owner_id, channel, recipient_key, step_index, status, is_preview, sent_at, created_at, updated_at)
       VALUES ($1, $2, 'peer_yesterday', 1, 'sent', false,
               (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '30 minutes',
               now(), now())`,
      [owner.id, MOCK_KEY]
    );
    await db.query(
      `INSERT INTO campaign_channel_messages
         (workspace_owner_id, channel, recipient_key, step_index, status, is_preview, sent_at, created_at, updated_at)
       VALUES ($1, $2, 'peer_today', 1, 'sent', false,
               (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '30 minutes',
               now(), now())`,
      [owner.id, MOCK_KEY]
    );

    expect(await countZaloSentToday(owner.id)).toBe(1);
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
    expect(await countZaloSentTodayWithLedger(db, owner.id, vnDayStart, vnDayEnd)).toBe(1);
  });

  it('(c) employee: ccm.actor_user_id = nhân viên -> tính; nhân viên khác -> không', async () => {
    const employee = await createUser({
      email: `pr4_emp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
    const otherEmployee = await createUser({
      email: `pr4_emp2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });

    await insertCcm({ workspaceOwnerId: owner.id, actorUserId: employee.id });
    await insertCcm({ workspaceOwnerId: owner.id, actorUserId: otherEmployee.id });

    const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
    expect(await countEmployeeZaloSentToday(owner.id, employee.id)).toBe(1);
    expect(await countEmployeeSentTodayWithLedger(db, owner.id, employee.id, 'zalo', vnDayStart, vnDayEnd)).toBe(1);

    const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    expect(await countEmployeeZaloSentThisMonth(owner.id, employee.id, cycleStart, cycleEnd)).toBe(1);
    expect(
      await countEmployeeSentInCycleWithLedger(db, owner.id, employee.id, 'zalo', cycleStart, cycleEnd)
    ).toBe(1);

    // Nhân viên khác không được tính vào.
    const thirdEmployee = await createUser({
      email: `pr4_emp3_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
    expect(await countEmployeeZaloSentToday(owner.id, thirdEmployee.id)).toBe(0);
  });

  it('(d) countCombinedSentInCycle(+WithLedger) cộng ccm; email count không đổi', async () => {
    const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

    await db.query(
      `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
       VALUES ($1, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
      [owner.id]
    );
    const beforeCombined = await countCombinedSentInCycle(owner.id, cycleStart, cycleEnd);
    const beforeEmail = await countEmailSentInCycleUncached(owner.id, cycleStart, cycleEnd);
    expect(beforeCombined).toBe(1);

    await insertCcm({ workspaceOwnerId: owner.id });
    await insertCcm({ workspaceOwnerId: owner.id });

    _clearQuotaCache();
    const afterCombined = await countCombinedSentInCycle(owner.id, cycleStart, cycleEnd);
    const afterEmail = await countEmailSentInCycleUncached(owner.id, cycleStart, cycleEnd);
    expect(afterCombined).toBe(3);
    expect(afterEmail).toBe(beforeEmail); // email count không đổi

    const zaloWithLedgerBefore = await countZaloSentInCycleWithLedger(db, owner.id, cycleStart, cycleEnd);
    expect(zaloWithLedgerBefore).toBe(2);
    const zaloUncachedBefore = await countZaloSentInCycleUncached(owner.id, cycleStart, cycleEnd);
    expect(zaloUncachedBefore).toBe(2);
  });

  it('(e) checkSendQuota({channel:"telegram"}) -> throw', async () => {
    await expect(
      checkSendQuota({ userId: owner.id, channel: 'telegram' })
    ).rejects.toThrow(/kênh không hợp lệ/i);
  });

  it('(f) runner + gate thật, mode off, plan daily_zalo_limit=2, đã có 2 zalo_messages hôm nay -> PLAN_SEND_LIMIT_EXCEEDED, run DEFER (quotaDeferredUntil, KHÔNG failed) [PR-5], 0 lần gửi', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    const plan = await createTestPlan({ dailyZalo: 2 });
    await assignPlanToUser(owner.id, plan.id);
    await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    await insertZaloMessageSent({ workspaceOwnerId: owner.id });
    _clearQuotaCache();

    const { rows: campaignRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'PR-4 quota test', 'email', 'active') RETURNING id`,
      [owner.id]
    );
    const campaignId = campaignRows[0].id;
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
       VALUES ($1, 'action', $2, $2, $3::jsonb, 1)`,
      [
        campaignId,
        MOCK_SUBTYPE,
        JSON.stringify({
          recipientSource: 'manual',
          recipientKeys: ['peer1'],
          steps: [{ message: 'Bước 1' }],
        }),
      ]
    );
    const { rows: runRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
       VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
      [campaignId, owner.id]
    );
    const run = runRows[0];

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);
    const { rows: afterRun } = await db.query(
      'SELECT status, run_metadata, total_recipients, successful_sends, failed_sends, skipped_sends FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    // PR-5 — daily limit luôn có resetAt (nextVnMidnight()) nên PLAN_SEND_LIMIT_EXCEEDED giờ
    // NHẢ SLOT chờ resume (quotaDeferredUntil) thay vì đánh run failed; xem test riêng (e) trong
    // campaignChannelDeferPr5.test.js cho nhánh KHÔNG resetAt (gói hết hạn) vẫn failed.
    expect(afterRun[0].status).toBe('running');
    expect(String(afterRun[0].run_metadata.quotaDeferredReason || '')).toMatch(/^plan_quota/);
    expect(afterRun[0].run_metadata.quotaDeferredUntil).toBeTruthy();
    const { total_recipients: total, successful_sends: ok, failed_sends: bad, skipped_sends: sk } = afterRun[0];
    expect(ok + bad + sk).toBeLessThanOrEqual(total);
  });

  it('(g) mode test_enforce -> ccm.quota_reservation_id khác NULL, reservation consumed, count không đôi', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'test_enforce';
    const plan = await createTestPlan({ dailyZalo: 100 });
    await assignPlanToUser(owner.id, plan.id);
    _clearQuotaCache();

    const { rows: campaignRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'PR-4 enforce test', 'email', 'active') RETURNING id`,
      [owner.id]
    );
    const campaignId = campaignRows[0].id;
    const { rows: nodeRows } = await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
       VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING id`,
      [
        campaignId,
        MOCK_SUBTYPE,
        JSON.stringify({
          recipientSource: 'manual',
          recipientKeys: ['peer1'],
          steps: [{ message: 'Bước 1' }],
        }),
      ]
    );
    const nodeId = nodeRows[0].id;
    const { rows: runRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
       VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
      [campaignId, owner.id]
    );
    const run = runRows[0];

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
      `SELECT status FROM send_quota_reservations WHERE id = $1`,
      [ccmRows[0].quota_reservation_id]
    );
    expect(reservationRows[0].status).toBe('consumed');

    // Đếm KHÔNG đôi: countZaloSentTodayWithLedger loại ccm có quota_reservation_id khác NULL (đã có
    // vế reservation riêng trong send_quota_reservations cộng vào, xem SỬA PR-4).
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
    const countAfter = await countZaloSentTodayWithLedger(db, owner.id, vnDayStart, vnDayEnd);
    expect(countAfter).toBe(1);
  });
});
