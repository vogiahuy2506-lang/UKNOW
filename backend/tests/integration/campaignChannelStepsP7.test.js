/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P7 — nhiều bước có hẹn giờ + chạy liên tục cho kênh adapter (Telegram/WhatsApp),
 * kiểm bằng kênh giả đăng ký ở registry (cùng khuôn campaignChannelDeferPr5.test.js).
 *
 * a) one-shot, 2 bước trễ 1 phút: lượt 1 gửi bước 1, bước 2 CHỜ -> run VẪN 'running', `nonContinuousDeferredUntil`
 *    ≈ mốc đến hạn (cơ chế ledger `nextDueAt` sẵn có của Zalo/email), total=2 ok=1; KHÔNG failed/skipped.
 * b) resume khi đến hạn: gửi bước 2, run 'completed', total KHÔNG tăng, ok=2, bất biến ok+failed+skipped <= total.
 * c) scheduler (recoverNonContinuousCampaignRuns): mốc tương lai KHÔNG nhặt; quá khứ nhặt.
 * d) continuous: bước 2 sắp đến hạn (ledger giả lập) -> chu kỳ SAU được đánh thức đúng mốc (không đợi poll 60s+) và gửi bước 2.
 * e) continuous với nguồn người nhận rỗng ở chu kỳ đầu: KHÔNG failed (CHANNEL_NO_RECIPIENTS chỉ dành cho one-shot).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const {
  createNoopChannelQuotaGate,
  __resetPerHourWindowForTest,
} = await import('../../src/services/campaign/campaignChannelRunner.service.js');
const { _recoverNonContinuousCampaignRunsForTests } = await import('../../src/utils/scheduler.js');

const MOCK_SUBTYPE = 'send_mock_steps_p7';
const MOCK_KEY = 'mock_steps_p7';
const MINUTE = 60 * 1000;

let owner;
let fakeSendOne;
let recipientsProvider;
let originalQuotaGate;

function registerMockChannel() {
  campaignChannelRegistry.__registerChannelForTest({
    key: MOCK_KEY,
    sendNodeSubtype: MOCK_SUBTYPE,
    engine: 'adapter',
    continuousSupported: true,
    continuousReplay: true,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: jest.fn().mockResolvedValue(),
      resolveAccount: jest.fn().mockResolvedValue({ accountKey: 'mock_account_p7', display: 'Mock' }),
      resolveRecipients: async ({ rows }) => recipientsProvider(rows),
      sendOne: fakeSendOne,
      classifyError: (err) => err?.category || 'hard',
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  __resetPerHourWindowForTest();
  owner = await createUser({
    email: `p7_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
  let seq = 1;
  fakeSendOne = jest.fn().mockImplementation(async () => ({ messageId: `p7_msg_${seq++}` }));
  recipientsProvider = (rows) => rows.map((row) => ({
    recipientKey: String(row.recipientKey || '').trim(),
    display: row.recipientKey,
    vars: {},
  }));
  campaignChannelRegistry.__resetTestChannels();
  registerMockChannel();
  originalQuotaGate = campaignRunService.channelQuotaGate;
  campaignRunService.channelQuotaGate = createNoopChannelQuotaGate();
});

afterEach(async () => {
  campaignChannelRegistry.__resetTestChannels();
  campaignRunService.channelQuotaGate = originalQuotaGate;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
  __resetPerHourWindowForTest();
});

async function insertCampaign() {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'P7 steps test', 'email', 'active') RETURNING id`,
    [owner.id]
  );
  return rows[0].id;
}

async function insertNode({ campaignId, config }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING id`,
    [campaignId, MOCK_SUBTYPE, JSON.stringify(config)]
  );
  return rows[0].id;
}

async function insertRun({ campaignId, metadata = {} }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', $3::jsonb) RETURNING *`,
    [campaignId, owner.id, JSON.stringify(metadata)]
  );
  return rows[0];
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

const TWO_STEPS = [
  { message: 'Bước 1' },
  { message: 'Bước 2', delayValue: 1, delayUnit: 'minutes' },
];

describe('P7 — nhiều bước có hẹn giờ (one-shot)', () => {
  it('(a)+(b) lượt 1: bước 2 chờ, run giữ running + park theo nextDueAt; đến hạn resume gửi bước 2 rồi completed', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: TWO_STEPS },
    });
    const run = await insertRun({ campaignId });

    const beforeMs = Date.now();
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    // Lượt 1: chỉ bước 1 được gửi.
    expect(fakeSendOne).toHaveBeenCalledTimes(1);
    expect(fakeSendOne.mock.calls[0][0]).toMatchObject({ recipientKey: 'peer1', stepIndex: 1 });
    const parked = await getRunRow(run.id);
    expect(parked.status).toBe('running');
    expect(parked.completed_at).toBeNull();
    expect(parked.total_recipients).toBe(2); // 1 người × 2 bước
    expect(parked.successful_sends).toBe(1);
    expect(parked.failed_sends).toBe(0);
    // Park run-level theo mốc nextDueAt sớm nhất của ledger (≈ lúc gửi bước 1 + 1 phút).
    const untilMs = Date.parse(parked.run_metadata.nonContinuousDeferredUntil);
    expect(untilMs).toBeGreaterThan(beforeMs + 30 * 1000);
    expect(untilMs).toBeLessThanOrEqual(Date.now() + MINUTE + 5000);
    expect(parked.run_metadata.nonContinuousDeferredReason).toBe('all_recipients_waiting_next_due');

    // Ledger: hoàn tất bước 1, chưa xong hẳn, có nextDueAt.
    const { rows: ledger } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta FROM campaign_run_recipient_steps WHERE id_run = $1 AND id_node = $2`,
      [run.id, nodeId]
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].last_completed_step).toBe(1);
    expect(ledger[0].is_fully_completed).toBe(false);
    expect(ledger[0].meta.nextDueAt).toBeTruthy();

    // Chưa đến hạn: chạy lại (scheduler chưa nhặt nhưng nếu ai gọi trực tiếp) — mốc park còn tương lai -> thoát sớm, KHÔNG gửi.
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(1);

    // Giả lập thời gian trôi 2 phút: lùi lastCompletedAt/nextDueAt của ledger + xoá mốc park (scheduler đã nhặt).
    const past = new Date(Date.now() - 2 * MINUTE).toISOString();
    await db.query(
      `UPDATE campaign_run_recipient_steps
       SET meta = meta || jsonb_build_object('lastCompletedAt', $2::text, 'nextDueAt', $2::text)
       WHERE id_run = $1`,
      [run.id, past]
    );
    await db.query(
      `UPDATE campaign_runs SET run_metadata = run_metadata - 'nonContinuousDeferredUntil' - 'nonContinuousDeferredReason' - 'nonContinuousDeferredAt' WHERE id = $1`,
      [run.id]
    );
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(2);
    expect(fakeSendOne.mock.calls[1][0]).toMatchObject({ recipientKey: 'peer1', stepIndex: 2 });
    const done = await getRunRow(run.id);
    expect(done.status).toBe('completed');
    expect(done.total_recipients).toBe(2); // KHÔNG tăng thêm ở lượt resume
    expect(done.successful_sends).toBe(2);
    expect(done.successful_sends + done.failed_sends + done.skipped_sends).toBeLessThanOrEqual(done.total_recipients);
  }, 30000);

  it('(c) scheduler: run đang park chờ bước kế — mốc tương lai KHÔNG nhặt, quá khứ thì nhặt', async () => {
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: TWO_STEPS },
    });
    const run = await insertRun({ campaignId });
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    expect((await getRunRow(run.id)).status).toBe('running');

    const notYet = await _recoverNonContinuousCampaignRunsForTests();
    expect(notYet.recovered).toBe(0);

    await db.query(
      `UPDATE campaign_runs SET run_metadata = jsonb_set(run_metadata, '{nonContinuousDeferredUntil}', to_jsonb($2::text)) WHERE id = $1`,
      [run.id, new Date(Date.now() - 1000).toISOString()]
    );
    const due = await _recoverNonContinuousCampaignRunsForTests();
    expect(due.recovered).toBe(1);
  }, 30000);

  it('bước 2 KHÔNG trễ -> gửi liền cả 2 bước trong một lượt, run completed (hành vi trước P7 giữ nguyên)', async () => {
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: [{ message: 'a' }, { message: 'b' }] },
    });
    const run = await insertRun({ campaignId });
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(2);
    const row = await getRunRow(run.id);
    expect(row.status).toBe('completed');
    expect(row.successful_sends).toBe(2);
  }, 30000);
});

describe('P7 — chạy liên tục (continuous)', () => {
  it('(d) bước 2 sắp đến hạn: chu kỳ được đánh thức ĐÚNG mốc (không đợi poll ≥ 60s) và gửi bước 2', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: TWO_STEPS },
    });
    // pollIntervalMs sàn 60s: nếu KHÔNG đăng ký wake theo mốc bước kế thì chu kỳ sau đến ≥ ~42s (jitter −30%) — quá xa.
    const run = await insertRun({ campaignId, metadata: { continuousMode: true, pollIntervalMs: 60 * 1000 } });
    // Ledger giả lập: bước 1 đã gửi cách đây 55s -> bước 2 (trễ 1 phút) đến hạn sau ~5s.
    const lastCompletedAt = new Date(Date.now() - 55 * 1000).toISOString();
    await db.query(
      `INSERT INTO campaign_run_recipient_steps
         (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, last_sent_at, meta, updated_at)
       VALUES ($1, $2, $3, $4, 'peer1', 1, FALSE, NOW(), $5::jsonb, NOW())`,
      [run.id, campaignId, nodeId, MOCK_KEY, JSON.stringify({ firstSentAt: lastCompletedAt, lastCompletedAt })]
    );

    const runPromise = campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    try {
      const deadline = Date.now() + 25000;
      while (fakeSendOne.mock.calls.length === 0 && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      expect(fakeSendOne).toHaveBeenCalledTimes(1);
      expect(fakeSendOne.mock.calls[0][0]).toMatchObject({ recipientKey: 'peer1', stepIndex: 2 });
    } finally {
      await db.query(`UPDATE campaign_runs SET status = 'stopped' WHERE id = $1`, [run.id]);
      await runPromise;
    }
    const { rows } = await db.query(
      `SELECT last_completed_step, is_fully_completed FROM campaign_run_recipient_steps WHERE id_run = $1`,
      [run.id]
    );
    expect(rows[0]).toMatchObject({ last_completed_step: 2, is_fully_completed: true });
  }, 60000);

  it('(e) continuous: nguồn người nhận rỗng KHÔNG làm run failed (one-shot vẫn failed CHANNEL_NO_RECIPIENTS)', async () => {
    recipientsProvider = () => [];
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: [{ message: 'a' }] },
    });
    const oneShot = await insertRun({ campaignId });
    await campaignRunService.executeCampaign(campaignId, oneShot.id, owner.id);
    expect((await getRunRow(oneShot.id)).status).toBe('failed');

    const run = await insertRun({ campaignId, metadata: { continuousMode: true, pollIntervalMs: 60 * 1000 } });
    const runPromise = campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const row = await getRunRow(run.id);
      expect(row.status).toBe('running');
      expect(row.error_message || null).toBeNull();
    } finally {
      await db.query(`UPDATE campaign_runs SET status = 'stopped' WHERE id = $1`, [run.id]);
      await runPromise;
    }
    expect(fakeSendOne).not.toHaveBeenCalled();
  }, 60000);
});
