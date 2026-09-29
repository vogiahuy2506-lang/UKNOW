/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-3 — Runner chung cho kênh adapter (one-shot) + mock adapter.
 *
 * a) 5 người × 2 bước → 10 dòng sent, ledger 5 dòng lastCompletedStep=2, counters
 *    total=10 success=10 failed=0 skipped=0, run completed.
 * b) chạy run MỚI cùng campaign trong cửa sổ dedupe → 0 lần sendOne, messages vẫn 10,
 *    skipped tăng, invariant giữ.
 * c) mock ném hard ở người 2 → người 2 failed, người 3-5 vẫn gửi;
 *    mock ném rate_limit ở người 3 → run DEFER (review PR-5: rate_limit phát sinh khi gửi cũng defer,
 *    mặc định 15 phút), đúng 2 người đã gửi.
 * d) mock quietHours bao trùm giờ hiện tại → 0 lần gửi, run DEFER (run vẫn 'running',
 *    channelDeferredReason='channel_quiet_hours') lý do quiet_hours — ĐỔI Ở PR-5, trước đó là
 *    run failed.
 * e) engine: node mock subtype không bị cầu dao PR-1 chặn; preflight gọi checkReadiness
 *    (mock throw → 400 đúng code).
 * f) quotaGate mặc định (không truyền no-op) → run failed CHANNEL_QUOTA_NOT_WIRED, 0 lần gửi.
 *
 * Vòng 2 (review vòng 1, F1/F2/F3):
 * g) rate_limit ở người 3 (5 người x 1 bước) → run defer; total=3 success=2 failed=0 (F1 + review PR-5:
 *    lỗi dừng-để-thử-lại KHÔNG cộng failed); resume → 5/5 gửi, bất biến giữ.
 * g2) rate_limit có retryAfterMs 30 phút (FLOOD_WAIT) → channelDeferredUntil ≈ now + 30 phút.
 * h) hard ở người 2 (3 người x 2 bước), resume CÙNG run → lần 2 sendOne 0 lần cho người 2;
 *    ledger người 2 is_fully_completed + lastFailureReason='hard'; total sau 2 lần = 6 (F2).
 * i) quiet_hours bao trùm rồi tắt, resume CÙNG run → total không tăng thêm cho người đầu,
 *    người đó ĐƯỢC gửi ở lần 2 (không bị đánh dấu bỏ cuộc) (F2 nhánh không-xong) — run sau lần 1
 *    giờ 'running' (defer), KHÔNG 'failed' — ĐỔI Ở PR-5.
 * j) 1 người x 2 bước: ledger meta.firstSentAt ≤ lastCompletedAt và khác nhau khi có delay
 *    giữa 2 bước (F3).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { validateCampaignPreflight } = await import('../../src/services/campaign/campaignPreflight.service.js');
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { createNoopChannelQuotaGate } = await import('../../src/services/campaign/campaignChannelRunner.service.js');

const MOCK_SUBTYPE = 'send_mock_channel';
const MOCK_KEY = 'mock_channel';

let user;
let fakeSendOne;
let fakeCheckReadiness;
let fakeResolveAccount;
let fakeClassifyError;
let originalQuotaGate;

function buildMockDescriptor(overrides = {}) {
  return {
    key: MOCK_KEY,
    sendNodeSubtype: MOCK_SUBTYPE,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: {
      minDelayMs: 0,
      maxDelayMs: 0,
      perHourLimit: 0,
      quietHours: null,
      ...(overrides.policy || {}),
    },
    adapter: {
      checkReadiness: fakeCheckReadiness,
      resolveAccount: fakeResolveAccount,
      resolveRecipients: async ({ rows }) => rows.map((row) => ({
        recipientKey: String(row.recipientKey || '').trim(),
        display: row.recipientKey,
        vars: {},
      })),
      sendOne: fakeSendOne,
      classifyError: fakeClassifyError,
    },
  };
}

function registerMockChannel(overrides = {}) {
  campaignChannelRegistry.__registerChannelForTest(buildMockDescriptor(overrides));
}

beforeEach(async () => {
  await truncateAll();
  user = await createUser({
    email: `pr3_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });

  let msgIdSeq = 1;
  fakeSendOne = jest.fn().mockImplementation(async () => ({ messageId: `mock_msg_${msgIdSeq++}` }));
  fakeCheckReadiness = jest.fn().mockResolvedValue();
  fakeResolveAccount = jest.fn().mockResolvedValue({ accountKey: 'mock_account_1', display: 'Mock Account' });
  fakeClassifyError = jest.fn().mockImplementation((err) => err?.category || 'hard');

  campaignChannelRegistry.__resetTestChannels();
  registerMockChannel();

  originalQuotaGate = campaignRunService.channelQuotaGate;
  campaignRunService.channelQuotaGate = createNoopChannelQuotaGate();
});

afterEach(() => {
  campaignChannelRegistry.__resetTestChannels();
  campaignRunService.channelQuotaGate = originalQuotaGate;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function insertCampaign({ campaignName = 'PR-3 test' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, 'email', 'active') RETURNING id, workspace_owner_id, id_user`,
    [user.id, campaignName]
  );
  return rows[0];
}

async function insertNode({ campaignId, config = {} }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING *`,
    [campaignId, MOCK_SUBTYPE, JSON.stringify(config)]
  );
  return rows[0];
}

async function insertRun({ campaignId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
    [campaignId, user.id]
  );
  return rows[0];
}

const FIVE_RECIPIENTS = ['peer1', 'peer2', 'peer3', 'peer4', 'peer5'];
const TWO_STEPS_CONFIG = {
  recipientSource: 'manual',
  recipientKeys: FIVE_RECIPIENTS,
  steps: [{ message: 'Bước 1' }, { message: 'Bước 2' }],
};

async function runCampaignToCompletion(campaignId, runId) {
  await campaignRunService.executeCampaign(campaignId, runId, user.id);
}

describe('PR-3 — Runner chung kênh adapter (mock)', () => {
  it('(a) 5 người x 2 bước -> 10 sent, ledger 5 dòng lastCompletedStep=2, counters đúng, run completed', async () => {
    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });

    await runCampaignToCompletion(campaign.id, run.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(10);

    const { rows: msgRows } = await db.query(
      `SELECT status FROM campaign_channel_messages WHERE id_run = $1 AND id_node = $2`,
      [run.id, node.id]
    );
    expect(msgRows).toHaveLength(10);
    expect(msgRows.every((r) => r.status === 'sent')).toBe(true);

    const { rows: ledgerRows } = await db.query(
      `SELECT recipient_key, last_completed_step FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 ORDER BY recipient_key ASC`,
      [run.id, String(node.id)]
    );
    expect(ledgerRows).toHaveLength(5);
    expect(ledgerRows.every((r) => r.last_completed_step === 2)).toBe(true);

    const { rows: runRows } = await db.query(
      `SELECT status, total_recipients, successful_sends, failed_sends, skipped_sends
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(runRows[0].status).toBe('completed');
    expect(runRows[0].total_recipients).toBe(10);
    expect(runRows[0].successful_sends).toBe(10);
    expect(runRows[0].failed_sends).toBe(0);
    expect(runRows[0].skipped_sends).toBe(0);
  });

  it('(b) run MỚI cùng campaign trong cửa sổ dedupe -> 0 lần sendOne mới, messages vẫn 10, skipped tăng, invariant giữ', async () => {
    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run1 = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run1.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(10);

    fakeSendOne.mockClear();
    const run2 = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run2.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);

    const { rows: msgRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages WHERE id_node = $1`,
      [node.id]
    );
    expect(msgRows[0].n).toBe(10);

    const { rows: runRows } = await db.query(
      `SELECT status, total_recipients, successful_sends, failed_sends, skipped_sends
       FROM campaign_runs WHERE id = $1`,
      [run2.id]
    );
    expect(runRows[0].status).toBe('completed');
    expect(runRows[0].skipped_sends).toBeGreaterThan(0);
    const { total_recipients: total, successful_sends: ok, failed_sends: bad, skipped_sends: sk } = runRows[0];
    expect(ok + bad + sk).toBeLessThanOrEqual(total);
  });

  it('(b2) resume CÙNG run_id — total KHÔNG cộng lại cho người đã có ledger (khuôn R:4381)', async () => {
    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });

    // Giả lập run này ĐÃ xử lý xong peer1/peer2 ở lượt gọi TRƯỚC (vd server restart giữa chừng) —
    // ledger đã có dòng thật, updated_at khác NULL — TRƯỚC KHI executeCampaign chạy lần này.
    await db.query(
      `INSERT INTO campaign_run_recipient_steps
         (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, updated_at)
       VALUES
         ($1, $2, $3, $4, 'peer1', 2, true, now()),
         ($1, $2, $3, $4, 'peer2', 2, true, now())`,
      [run.id, campaign.id, String(node.id), MOCK_KEY]
    );

    await runCampaignToCompletion(campaign.id, run.id);

    // peer1/peer2 đã có ledger (updatedAt khác NULL) nên KHÔNG cộng total cho họ, và vòng while
    // không chạy vì lastCompletedStep=2=steps.length — chỉ peer3/4/5 "lần đầu thấy" cộng 2 bước.
    expect(fakeSendOne).toHaveBeenCalledTimes(6);
    const { rows: runRows } = await db.query(
      'SELECT total_recipients, successful_sends FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    expect(runRows[0].total_recipients).toBe(6);
    expect(runRows[0].successful_sends).toBe(6);
  });

  it('(c1) mock ném hard ở người 2 -> người 2 failed, người 3-5 vẫn gửi', async () => {
    fakeSendOne.mockImplementation(async ({ recipientKey }) => {
      if (recipientKey === 'peer2') {
        const err = new Error('peer2 hard fail');
        err.category = 'hard';
        throw err;
      }
      return { messageId: `mock_msg_${recipientKey}` };
    });

    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);

    const { rows: runRows } = await db.query('SELECT status FROM campaign_runs WHERE id = $1', [run.id]);
    expect(runRows[0].status).toBe('completed');

    const { rows: sentRows } = await db.query(
      `SELECT DISTINCT recipient_key FROM campaign_channel_messages
       WHERE id_run = $1 AND id_node = $2 AND status = 'sent' ORDER BY recipient_key ASC`,
      [run.id, node.id]
    );
    expect(sentRows.map((r) => r.recipient_key)).toEqual(['peer1', 'peer3', 'peer4', 'peer5']);

    const { rows: failedRows } = await db.query(
      `SELECT recipient_key FROM campaign_channel_messages
       WHERE id_run = $1 AND id_node = $2 AND status = 'failed'`,
      [run.id, node.id]
    );
    expect(failedRows.map((r) => r.recipient_key)).toEqual(['peer2']);
  });

  it('(c2) mock ném rate_limit ở người 3 -> run defer (mặc định 15 phút), đúng 2 người đã gửi', async () => {
    fakeSendOne.mockImplementation(async ({ recipientKey, stepIndex }) => {
      if (recipientKey === 'peer3') {
        const err = new Error('peer3 rate limited');
        err.category = 'rate_limit';
        throw err;
      }
      return { messageId: `mock_msg_${recipientKey}_${stepIndex}` };
    });

    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);

    const { rows: runRows } = await db.query(
      `SELECT status,
              run_metadata->>'channelDeferredReason' AS reason,
              EXTRACT(EPOCH FROM ((run_metadata->>'channelDeferredUntil')::timestamptz - now()))::int AS wait_s
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(runRows[0].status).toBe('running');
    expect(runRows[0].reason).toBe('channel_rate_limit');
    expect(Math.abs(runRows[0].wait_s - 15 * 60)).toBeLessThanOrEqual(60);

    const { rows: sentRows } = await db.query(
      `SELECT DISTINCT recipient_key FROM campaign_channel_messages
       WHERE id_run = $1 AND id_node = $2 AND status = 'sent'`,
      [run.id, node.id]
    );
    expect(sentRows.map((r) => r.recipient_key).sort()).toEqual(['peer1', 'peer2']);
  });

  it('(d) mock quietHours bao trùm giờ hiện tại -> 0 lần gửi, run defer (KHÔNG failed) lý do quiet_hours [PR-5]', async () => {
    campaignChannelRegistry.__resetTestChannels();
    const nowVnHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
    // Khung 24 giờ trọn vẹn quanh giờ hiện tại (vắt nửa đêm) — chắc chắn bao trùm bất kể giờ chạy test thật.
    const startHour = nowVnHour;
    const endHour = nowVnHour; // startHour === endHour bị coi "không có khung" ở isWithinQuietHours,
    // nên lùi endHour 1 giờ để tạo khung vắt nửa đêm 23 giờ bao trùm gần như toàn bộ ngày, chắc chắn
    // chứa giờ hiện tại (start = nowHour, end = nowHour - 1 (mod 24) => quiet = hour>=start || hour<end,
    // tại hour=nowHour: nowHour>=nowHour true => luôn true).
    registerMockChannel({ policy: { quietHours: { startHour, endHour: (endHour + 23) % 24 } } });

    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);

    const { rows: runRows } = await db.query(
      'SELECT status, run_metadata FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    // PR-5 — quiet_hours giờ NHẢ SLOT chờ resume (channelDeferredUntil) thay vì đánh run failed.
    expect(runRows[0].status).toBe('running');
    expect(runRows[0].run_metadata.channelDeferredReason).toBe('channel_quiet_hours');
    expect(runRows[0].run_metadata.channelDeferredChannel).toBe(MOCK_KEY);
    expect(runRows[0].run_metadata.channelDeferredUntil).toBeTruthy();

    const { rows: msgRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages WHERE id_node = $1`,
      [node.id]
    );
    expect(msgRows[0].n).toBe(0);
  });

  it('(e) preflight gọi checkReadiness — mock throw thì 400 đúng code; node mock không bị cầu dao PR-1 chặn', async () => {
    const campaign = await insertCampaign();
    await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });

    // Chưa throw — preflight phải cho qua bình thường (subtype adapter, KHÔNG bị cầu dao
    // UNSUPPORTED_SEND_NODE chặn dù registry biết nó qua nhánh 'adapter' chứ không phải 'legacy').
    await expect(
      validateCampaignPreflight({ campaignId: campaign.id, workspaceOwnerId: user.id })
    ).resolves.toMatchObject({ valid: true });

    fakeCheckReadiness.mockImplementation(async () => {
      const err = new Error('Tài khoản mock chưa cấu hình');
      err.code = 'MOCK_NOT_CONFIGURED';
      throw err;
    });

    await expect(
      validateCampaignPreflight({ campaignId: campaign.id, workspaceOwnerId: user.id })
    ).rejects.toMatchObject({ code: 'MOCK_NOT_CONFIGURED', statusCode: 400 });
  });

  it('(f) quotaGate mặc định (không truyền no-op) là gate THẬT của PR-4 — plan mặc định permissive thì gửi bình thường', async () => {
    // PR-4 đổi engine.channelQuotaGate mặc định từ bản throw CHANNEL_QUOTA_NOT_WIRED (PR-3) sang
    // gate thật (createCampaignChannelQuotaGate) — bài test này trước đây (PR-3) khẳng định "chưa
    // đấu nối thì run failed", nay khẳng định ngược lại: đấu nối thật rồi, plan mặc định của
    // createUser() rất rộng rãi (daily_zalo_limit=1000000) nên KHÔNG chặn, gửi bình thường. Kịch
    // bản "quota chặn thật" đã có bộ test riêng ở campaignChannelAdapterQuotaPr4.test.js.
    campaignRunService.channelQuotaGate = originalQuotaGate; // KHÔNG override — dùng đúng gate mặc định

    const campaign = await insertCampaign();
    const node = await insertNode({ campaignId: campaign.id, config: TWO_STEPS_CONFIG });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(10);

    const { rows: runRows } = await db.query(
      'SELECT status FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    expect(runRows[0].status).toBe('completed');

    const { rows: msgRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages WHERE id_node = $1 AND status = 'sent'`,
      [node.id]
    );
    expect(msgRows[0].n).toBe(10);
  });

  it('(g) mock rate_limit ở người 3 (5 người x 1 bước) -> run defer; total=3 success=2 failed=0; resume -> 5/5 (F1 + review PR-5)', async () => {
    let peer3Limited = true;
    fakeSendOne.mockImplementation(async ({ recipientKey }) => {
      if (recipientKey === 'peer3' && peer3Limited) {
        const err = new Error('peer3 rate limited');
        err.category = 'rate_limit';
        throw err;
      }
      return { messageId: `mock_msg_${recipientKey}` };
    });

    const campaign = await insertCampaign();
    const node = await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: FIVE_RECIPIENTS, steps: [{ message: 'Bước 1' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);

    const { rows: runRows } = await db.query(
      `SELECT status, total_recipients, successful_sends, failed_sends, skipped_sends
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(runRows[0].status).toBe('running');
    expect(runRows[0].total_recipients).toBe(3);
    expect(runRows[0].successful_sends).toBe(2);
    // Review PR-5 — rate_limit là lỗi dừng-để-thử-lại: KHÔNG cộng failed (bản trước ghim 1 là sai —
    // resume gửi lại đúng bước đó, cộng failed thì một bước bị đếm cả failed lẫn success).
    expect(runRows[0].failed_sends).toBe(0);
    const { total_recipients: total, successful_sends: ok, failed_sends: bad, skipped_sends: sk } = runRows[0];
    expect(ok + bad + sk).toBeLessThanOrEqual(total);

    // Resume CÙNG run sau khi hết chờ: peer3 gửi được, run xong, bất biến vẫn giữ.
    peer3Limited = false;
    await db.query(
      `UPDATE campaign_runs
         SET run_metadata = jsonb_set(run_metadata, '{channelDeferredUntil}', to_jsonb((NOW() - INTERVAL '1 minute')::text))
       WHERE id = $1`,
      [run.id]
    );
    await runCampaignToCompletion(campaign.id, run.id);
    const { rows: after } = await db.query(
      `SELECT status, total_recipients, successful_sends, failed_sends, skipped_sends
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(after[0].status).toBe('completed');
    expect(after[0].total_recipients).toBe(5);
    expect(after[0].successful_sends).toBe(5);
    expect(after[0].failed_sends).toBe(0);
    expect(after[0].successful_sends + after[0].failed_sends + after[0].skipped_sends)
      .toBeLessThanOrEqual(after[0].total_recipients);
    void node;
  });

  it('(g2) rate_limit có retryAfterMs 30 phút (FLOOD_WAIT) -> channelDeferredUntil ≈ now + 30 phút', async () => {
    fakeSendOne.mockImplementation(async ({ recipientKey }) => {
      if (recipientKey === 'peer2') {
        const err = new Error('FLOOD_WAIT_1800');
        err.category = 'rate_limit';
        err.retryAfterMs = 30 * 60 * 1000;
        throw err;
      }
      return { messageId: `mock_msg_${recipientKey}` };
    });
    const campaign = await insertCampaign();
    await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: FIVE_RECIPIENTS, steps: [{ message: 'Bước 1' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });
    await runCampaignToCompletion(campaign.id, run.id);
    const { rows } = await db.query(
      `SELECT status,
              EXTRACT(EPOCH FROM ((run_metadata->>'channelDeferredUntil')::timestamptz - now()))::int AS wait_s
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(rows[0].status).toBe('running');
    expect(Math.abs(rows[0].wait_s - 30 * 60)).toBeLessThanOrEqual(60);
  });

  it('(h) hard ở người 2 (3 người x 2 bước), resume CÙNG run -> lần 2 sendOne 0 lần cho người 2; ledger bỏ cuộc; total sau 2 lần = 6 (F2)', async () => {
    const THREE_RECIPIENTS = ['peer1', 'peer2', 'peer3'];
    fakeSendOne.mockImplementation(async ({ recipientKey }) => {
      if (recipientKey === 'peer2') {
        const err = new Error('peer2 hard fail');
        err.category = 'hard';
        throw err;
      }
      return { messageId: `mock_msg_${recipientKey}` };
    });

    const campaign = await insertCampaign();
    const node = await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: THREE_RECIPIENTS, steps: [{ message: 'B1' }, { message: 'B2' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });

    await runCampaignToCompletion(campaign.id, run.id);

    const { rows: afterRun1 } = await db.query(
      'SELECT status, total_recipients FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    expect(afterRun1[0].status).toBe('completed');
    expect(afterRun1[0].total_recipients).toBe(6);
    expect(fakeSendOne).toHaveBeenCalledTimes(5); // peer1(2) + peer2(1, fail) + peer3(2)

    fakeSendOne.mockClear();
    await db.query(`UPDATE campaign_runs SET status = 'running' WHERE id = $1`, [run.id]);
    await runCampaignToCompletion(campaign.id, run.id);

    const peer2Calls = fakeSendOne.mock.calls.filter(([arg]) => arg.recipientKey === 'peer2');
    expect(peer2Calls).toHaveLength(0);

    const { rows: ledgerRows } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = 'peer2'`,
      [run.id, String(node.id)]
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].is_fully_completed).toBe(true);
    expect(ledgerRows[0].last_completed_step).toBe(2);
    expect(ledgerRows[0].meta.lastFailureReason).toBe('hard');

    const { rows: afterRun2 } = await db.query(
      'SELECT total_recipients FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    expect(afterRun2[0].total_recipients).toBe(6);
  });

  it('(i) quiet_hours bao trùm rồi tắt, resume CÙNG run -> total không tăng thêm cho người đầu, người đó ĐƯỢC gửi ở lần 2 (F2 nhánh không-xong) [run defer PR-5]', async () => {
    const nowVnHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ policy: { quietHours: { startHour: nowVnHour, endHour: (nowVnHour + 23) % 24 } } });

    const campaign = await insertCampaign();
    const node = await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: FIVE_RECIPIENTS, steps: [{ message: 'Bước 1' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });

    await runCampaignToCompletion(campaign.id, run.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(0);

    const { rows: afterRun1 } = await db.query(
      'SELECT status, total_recipients FROM campaign_runs WHERE id = $1',
      [run.id]
    );
    // PR-5 — quiet_hours giờ NHẢ SLOT chờ resume (run VẪN 'running') thay vì đánh run failed; dòng
    // UPDATE status='running' bên dưới vì vậy thành no-op (đã sẵn 'running'), giữ lại cho rõ ý đồ
    // "resume CÙNG run" và an toàn nếu logic defer đổi khác sau này.
    expect(afterRun1[0].status).toBe('running');
    expect(afterRun1[0].total_recipients).toBe(1); // chỉ peer1 (người đầu) kịp "thấy" trước khi dừng

    // Tắt quiet hours rồi resume CÙNG run. channelDeferredUntil từ lần 1 còn cách rất xa (khung
    // 23 giờ) — PHẢI lùi nó về quá khứ (như test (c) "đặt mốc về quá khứ"), không thì
    // _exitIfRunDeferredUntilFuture (PR-5, campaignRun.service.js:~245) sẽ thoát sớm ngay từ đầu vì
    // vẫn thấy channelDeferredUntil > NOW(), khiến peer1 không được gọi lại như test này cần.
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ policy: { quietHours: null } });
    fakeSendOne.mockClear();
    await db.query(
      `UPDATE campaign_runs SET status = 'running',
         run_metadata = jsonb_set(run_metadata, '{channelDeferredUntil}', to_jsonb((NOW() - INTERVAL '1 minute')::text))
       WHERE id = $1`,
      [run.id]
    );
    await runCampaignToCompletion(campaign.id, run.id);

    const peer1Calls = fakeSendOne.mock.calls.filter(([arg]) => arg.recipientKey === 'peer1');
    expect(peer1Calls.length).toBeGreaterThan(0); // người đầu ĐƯỢC gửi ở lần 2 — không bị đánh dấu bỏ cuộc

    const { rows: afterRun2 } = await db.query(
      `SELECT status, total_recipients, successful_sends FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(afterRun2[0].status).toBe('completed');
    // total = 1 (peer1, từ lần 1, KHÔNG cộng lại) + 4 (peer2-5, lần đầu thấy ở lần 2) = 5.
    expect(afterRun2[0].total_recipients).toBe(5);
    expect(afterRun2[0].successful_sends).toBe(5);
    void node;
  });

  it('(j) 1 người x 2 bước — ledger meta.firstSentAt ≤ lastCompletedAt và khác nhau khi có delay giữa 2 bước (F3)', async () => {
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ policy: { minDelayMs: 1100, maxDelayMs: 1100 } });

    const campaign = await insertCampaign();
    const node = await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: [{ message: 'B1' }, { message: 'B2' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });

    await runCampaignToCompletion(campaign.id, run.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(2);

    const { rows: ledgerRows } = await db.query(
      `SELECT meta FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = 'peer1'`,
      [run.id, String(node.id)]
    );
    expect(ledgerRows).toHaveLength(1);
    const { firstSentAt, lastCompletedAt } = ledgerRows[0].meta;
    expect(firstSentAt).toBeTruthy();
    expect(lastCompletedAt).toBeTruthy();
    const firstMs = new Date(firstSentAt).getTime();
    const lastMs = new Date(lastCompletedAt).getTime();
    expect(firstMs).toBeLessThanOrEqual(lastMs);
    expect(lastMs - firstMs).toBeGreaterThanOrEqual(900); // delay 1100ms giữa 2 bước, chừa dư sai số
  }, 20000);

  it('(k) PLAN_TELEGRAM_0_NGUOI_NHAN: adapter trả 0 người nhận -> run FAILED có error_message, KHÔNG completed; đếm giữ 0', async () => {
    const campaign = await insertCampaign();
    const node = await insertNode({
      campaignId: campaign.id,
      config: { recipientSource: 'manual', recipientKeys: [], steps: [{ message: 'Bước 1' }] },
    });
    const run = await insertRun({ campaignId: campaign.id });

    await runCampaignToCompletion(campaign.id, run.id);

    expect(fakeSendOne).not.toHaveBeenCalled();
    const { rows } = await db.query(
      `SELECT status, error_message, total_recipients, successful_sends, failed_sends, skipped_sends
       FROM campaign_runs WHERE id = $1`,
      [run.id]
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toContain('Không có người nhận');
    expect(rows[0].error_message).toContain(String(node.id));
    expect(rows[0].total_recipients).toBe(0);
    expect(rows[0].successful_sends).toBe(0);
    expect(rows[0].failed_sends).toBe(0);
    expect(rows[0].skipped_sends).toBe(0);
  });
});
