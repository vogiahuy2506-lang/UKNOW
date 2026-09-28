/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-5 — Defer cho kênh adapter (thay vì run failed).
 *
 * a) quiet_hours bao trùm giờ hiện tại -> run VẪN 'running', run_metadata.channelDeferredUntil ≈
 *    giờ kết thúc khung (sai số ≤ 60s), channelDeferredReason='channel_quiet_hours',
 *    channelDeferredChannel = mock key; partial counts giữ.
 * b) rate_limit (perHour chạm trần, chờ > 60s) -> defer với waitMs ≈ phần còn lại cửa sổ.
 * c) scheduler nhặt run non-continuous (recoverNonContinuousCampaignRuns): mốc tương lai -> KHÔNG
 *    nhặt; mốc quá khứ -> nhặt.
 * d) cleanupStalledRuns (buildSafeStalledRunPredicate) không dọn run có channelDeferredUntil
 *    tương lai.
 * e) PLAN_SEND_LIMIT_EXCEEDED có resetAt -> quotaDeferredUntil set, run running; không resetAt
 *    (gói hết hạn) -> run failed.
 * f) resume sau khi hết khung: người chưa gửi được gửi, total KHÔNG tăng thêm, bất biến giữ.
 *
 * ĐỔI KỲ VỌNG SO VỚI PR-3 — ĐÃ CẬP NHẬT trực tiếp trong campaignChannelRunnerPr3.test.js: đúng
 * 2 ca (d) và (i), CẢ HAI đều là quiet_hours (proactive check, có error.waitMs) — giờ defer (run
 * 'running', channelDeferredReason='channel_quiet_hours') thay vì 'failed'.
 * LƯU Ý: (c2) và (g) là rate_limit REACTIVE (sendOne ném lỗi, classifyError phân loại) — KHÔNG đi
 * qua computePerHourWaitMs nên error.waitMs luôn undefined → engine coi là lỗi cứng, VẪN 'failed'
 * y nguyên, KHÔNG đổi. Chỉ rate_limit từ perHourLimit (proactive gate, như test (b) dưới đây) mới
 * có waitMs và defer được.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const {
  createNoopChannelQuotaGate,
  createCampaignChannelQuotaGate,
  __recordSendForTest,
  __resetPerHourWindowForTest,
  computeQuietHoursWaitMs,
} = await import('../../src/services/campaign/campaignChannelRunner.service.js');
const { buildSafeStalledRunPredicate } = await import('../../src/utils/cleanupStalledRuns.util.js');
const { _recoverNonContinuousCampaignRunsForTests } = await import('../../src/utils/scheduler.js');

const MOCK_SUBTYPE = 'send_mock_defer_channel';
const MOCK_KEY = 'mock_defer_channel';
const MOCK_ACCOUNT_KEY = 'mock_account_1';

let owner;
let fakeSendOne;
let originalQuotaGate;

function registerMockChannel(policyOverrides = {}) {
  campaignChannelRegistry.__registerChannelForTest({
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
      ...policyOverrides,
    },
    adapter: {
      checkReadiness: jest.fn().mockResolvedValue(),
      resolveAccount: jest.fn().mockResolvedValue({ accountKey: MOCK_ACCOUNT_KEY, display: 'Mock' }),
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
  __resetPerHourWindowForTest();
  owner = await createUser({
    email: `pr5_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
  let msgIdSeq = 1;
  fakeSendOne = jest.fn().mockImplementation(async () => ({ messageId: `mock_msg_${msgIdSeq++}` }));
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
  delete process.env.SEND_QUOTA_RESERVATION_MODE;
});

async function insertCampaign() {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'PR-5 defer test', 'email', 'active') RETURNING id`,
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

async function insertRun({ campaignId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
    [campaignId, owner.id]
  );
  return rows[0];
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

describe('PR-5 — Defer cho kênh adapter (thay vì run failed)', () => {
  it('(a) quiet_hours bao trùm -> run VẪN running, channelDeferredUntil/Reason/Channel đúng, partial counts giữ', async () => {
    const nowVnHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
    const quietHours = { startHour: nowVnHour, endHour: (nowVnHour + 23) % 24 };
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ quietHours });

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        recipientSource: 'manual',
        recipientKeys: ['peer1', 'peer2', 'peer3'],
        steps: [{ message: 'Bước 1' }],
      },
    });
    const run = await insertRun({ campaignId });

    const beforeMs = Date.now();
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    const afterMs = Date.now();

    // peer1 kịp "thấy" (total += 1) trước khi dừng ở quiet_hours — partial counts phải giữ.
    expect(fakeSendOne).toHaveBeenCalledTimes(0);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('running');
    expect(runRow.total_recipients).toBe(1);

    const meta = runRow.run_metadata;
    expect(meta.channelDeferredReason).toBe('channel_quiet_hours');
    expect(meta.channelDeferredChannel).toBe(MOCK_KEY);
    const untilMs = Date.parse(meta.channelDeferredUntil);
    expect(untilMs).toBeGreaterThan(beforeMs);
    // Dùng ĐÚNG hàm thuần computeQuietHoursWaitMs (đã có unit test riêng xác nhận đúng logic vắt
    // nửa đêm) để tính mốc kỳ vọng — tránh tự suy luận lại phép tính ngày/giờ trong test tích hợp.
    const expectedApproxMs = beforeMs + computeQuietHoursWaitMs(beforeMs, quietHours);
    expect(Math.abs(untilMs - expectedApproxMs)).toBeLessThanOrEqual(5000);
    void afterMs;

    const { rows: msgRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages WHERE id_node = $1`,
      [nodeId]
    );
    expect(msgRows[0].n).toBe(0);
  });

  it('(b) rate_limit (perHour chạm trần, chờ > 60s) -> defer với waitMs ≈ phần còn lại cửa sổ', async () => {
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ perHourLimit: 1 });

    const perHourKey = `${MOCK_KEY}::${MOCK_ACCOUNT_KEY}`;
    const fakeSentAgoMs = 5000; // 5 giây trước — còn ~59.9 phút nữa mới rớt khỏi cửa sổ 1 giờ.
    __recordSendForTest(perHourKey, Date.now() - fakeSentAgoMs);

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        recipientSource: 'manual',
        recipientKeys: ['peer1'],
        steps: [{ message: 'Bước 1' }],
      },
    });
    const run = await insertRun({ campaignId });

    const beforeMs = Date.now();
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('running');
    const meta = runRow.run_metadata;
    expect(meta.channelDeferredReason).toBe('channel_rate_limit');
    expect(meta.channelDeferredChannel).toBe(MOCK_KEY);

    const untilMs = Date.parse(meta.channelDeferredUntil);
    const expectedApproxMs = beforeMs + (60 * 60 * 1000 - fakeSentAgoMs);
    expect(Math.abs(untilMs - expectedApproxMs)).toBeLessThanOrEqual(5000);
    void nodeId;
  }, 20000);

  it('(c) scheduler recoverNonContinuousCampaignRuns: mốc tương lai KHÔNG nhặt; mốc quá khứ nhặt', async () => {
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: [], steps: [] },
    });

    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { rows: futureRunRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
       VALUES ($1, $2, 'manual', 'running', $3::jsonb) RETURNING id`,
      [campaignId, owner.id, JSON.stringify({ channelDeferredUntil: futureIso, channelDeferredReason: 'channel_quiet_hours' })]
    );
    const futureRunId = futureRunRows[0].id;

    const resultFutureOnly = await _recoverNonContinuousCampaignRunsForTests();
    expect(resultFutureOnly.recovered).toBe(0);
    const stillRunning = await getRunRow(futureRunId);
    expect(stillRunning.status).toBe('running');

    const pastIso = new Date(Date.now() - 60 * 1000).toISOString();
    await db.query(`UPDATE campaign_runs SET run_metadata = $2::jsonb WHERE id = $1`, [
      futureRunId,
      JSON.stringify({ channelDeferredUntil: pastIso, channelDeferredReason: 'channel_quiet_hours' }),
    ]);

    const resultPast = await _recoverNonContinuousCampaignRunsForTests();
    expect(resultPast.recovered).toBe(1);
  });

  it('(d) cleanupStalledRuns predicate không dọn run có channelDeferredUntil tương lai', async () => {
    const campaignId = await insertCampaign();
    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { rows: runRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata, started_at)
       VALUES ($1, $2, 'manual', 'running', $3::jsonb, NOW() - interval '50 hours') RETURNING id`,
      [campaignId, owner.id, JSON.stringify({ channelDeferredUntil: futureIso })]
    );
    const runId = runRows[0].id;

    const predicate = buildSafeStalledRunPredicate('$1');
    const { rows } = await db.query(
      `SELECT cr.id FROM campaign_runs cr WHERE ${predicate} AND cr.id = $2`,
      ['48', runId]
    );
    expect(rows).toHaveLength(0);

    // Đối chứng: bỏ channelDeferredUntil thì cùng run này PHẢI xuất hiện (predicate hoạt động đúng,
    // không phải do lỗi khác trong câu SQL làm nó luôn rỗng).
    await db.query(`UPDATE campaign_runs SET run_metadata = '{}'::jsonb WHERE id = $1`, [runId]);
    const { rows: rowsAfterClear } = await db.query(
      `SELECT cr.id FROM campaign_runs cr WHERE ${predicate} AND cr.id = $2`,
      ['48', runId]
    );
    expect(rowsAfterClear).toHaveLength(1);
  });

  it('(e) PLAN_SEND_LIMIT_EXCEEDED có resetAt -> quotaDeferredUntil set, run running; không resetAt -> run failed', async () => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    // Ca này cần cổng quota THẬT — cổng noop (mặc định beforeEach) không bao giờ chặn gửi nên
    // fakeSendOne vẫn được gọi dù quota đã hết (bug tự bắt được khi debug: countZaloSentToday/
    // checkSendQuota trả về đúng "allowed:false" nhưng run vẫn gửi vì gate đang là noop).
    campaignRunService.channelQuotaGate = createCampaignChannelQuotaGate();
    // Nhánh CÓ resetAt: plan daily_zalo_limit=1, đã có 1 zalo_messages hôm nay.
    const { rows: planRows } = await db.query(
      `INSERT INTO plans (name, price, daily_zalo_limit, is_active) VALUES ($1, 100000, 1, true) RETURNING id`,
      [`Plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`]
    );
    await db.query(
      `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '30 days' WHERE id = $2`,
      [planRows[0].id, owner.id]
    );
    await db.query(
      `INSERT INTO zalo_messages (workspace_owner_id, channel, tracking_metadata, is_preview, sent_at, created_at, updated_at)
       VALUES ($1, 'zalo_personal', '{"status":"sent"}'::jsonb, false, now(), now(), now())`,
      [owner.id]
    );

    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: [{ message: 'B1' }] },
    });
    const run = await insertRun({ campaignId });
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(0);
    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('running');
    expect(runRow.run_metadata.quotaDeferredUntil).toBeTruthy();
    expect(String(runRow.run_metadata.quotaDeferredReason || '')).toMatch(/^plan_quota/);

    // Nhánh KHÔNG resetAt: gói đã hết hạn (subscription_expires_at trong quá khứ).
    await db.query(
      `UPDATE users SET subscription_expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [owner.id]
    );
    // userSendLimit.util.js cache trạng thái subscription 1s (QUOTA_COUNT_CACHE_TTL_MS) — không
    // xoá thì lượt đọc kế tiếp trong cùng giây vẫn thấy gói "chưa hết hạn" từ nhánh trên, rơi vào
    // nhánh daily-limit (có resetAt) thay vì nhánh 'expired' (không resetAt) đang cần test.
    const { _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');
    _clearQuotaCache();
    fakeSendOne.mockClear();
    const campaign2Id = await insertCampaign();
    await insertNode({
      campaignId: campaign2Id,
      config: { recipientSource: 'manual', recipientKeys: ['peer1'], steps: [{ message: 'B1' }] },
    });
    const run2 = await insertRun({ campaignId: campaign2Id });
    await campaignRunService.executeCampaign(campaign2Id, run2.id, owner.id);

    const run2Row = await getRunRow(run2.id);
    expect(run2Row.status).toBe('failed');
  });

  it('(f) resume sau khi hết khung: người chưa gửi được gửi, total KHÔNG tăng thêm, bất biến giữ', async () => {
    const nowVnHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ quietHours: { startHour: nowVnHour, endHour: (nowVnHour + 23) % 24 } });

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        recipientSource: 'manual',
        recipientKeys: ['peer1', 'peer2'],
        steps: [{ message: 'Bước 1' }],
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    expect(fakeSendOne).toHaveBeenCalledTimes(0);
    const afterDefer = await getRunRow(run.id);
    expect(afterDefer.status).toBe('running');
    expect(afterDefer.total_recipients).toBe(1);

    // Tắt quiet hours + đặt lại mốc defer về quá khứ (giả lập scheduler nhặt sau khi hết khung).
    campaignChannelRegistry.__resetTestChannels();
    registerMockChannel({ quietHours: null });
    const pastIso = new Date(Date.now() - 1000).toISOString();
    await db.query(
      `UPDATE campaign_runs SET run_metadata = jsonb_set(run_metadata, '{channelDeferredUntil}', to_jsonb($2::text)) WHERE id = $1`,
      [run.id, pastIso]
    );

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(2); // peer1 (chưa gửi ở lượt trước) + peer2 (lần đầu thấy)

    const finalRun = await getRunRow(run.id);
    expect(finalRun.status).toBe('completed');
    expect(finalRun.total_recipients).toBe(2); // KHÔNG tăng thêm cho peer1 (đã "thấy" ở lượt 1)
    expect(finalRun.successful_sends).toBe(2);
    const { total_recipients: total, successful_sends: ok, failed_sends: bad, skipped_sends: sk } = finalRun;
    expect(ok + bad + sk).toBeLessThanOrEqual(total);
    void nodeId;
  });
});
