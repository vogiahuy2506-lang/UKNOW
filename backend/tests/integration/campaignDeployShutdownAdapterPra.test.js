import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A — test (d): kênh adapter (mock), shutdown giữa chừng.
 *
 * Khuôn mock lấy từ campaignChannelRunnerPr3.test.js.
 */

process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { createNoopChannelQuotaGate } = await import('../../src/services/campaign/campaignChannelRunner.service.js');
const campaignShutdownGate = (await import('../../src/services/campaign/campaignShutdownGate.js')).default;

const MOCK_SUBTYPE = 'send_mock_channel_pra';
const MOCK_KEY = 'mock_channel_pra';
const RECIPIENT_COUNT = 5;
const SHUTDOWN_AT_CALL = 2;

let user;
let fakeSendOne;
let originalQuotaGate;

function buildMockDescriptor() {
  return {
    key: MOCK_KEY,
    sendNodeSubtype: MOCK_SUBTYPE,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: jest.fn().mockResolvedValue(),
      resolveAccount: jest.fn().mockResolvedValue({ accountKey: 'mock_account_pra', display: 'Mock Account' }),
      resolveRecipients: async ({ rows }) => rows.map((row) => ({
        recipientKey: String(row.recipientKey || '').trim(),
        display: row.recipientKey,
        vars: {},
      })),
      sendOne: fakeSendOne,
      classifyError: (err) => err?.category || 'hard',
    },
  };
}

beforeEach(async () => {
  await truncateAll();
  campaignShutdownGate.__resetForTest();
  user = await createUser({
    email: `pra_adapter_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });

  let callCount = 0;
  fakeSendOne = jest.fn().mockImplementation(async () => {
    callCount += 1;
    if (callCount === SHUTDOWN_AT_CALL) {
      campaignShutdownGate.beginShutdown();
    }
    return { messageId: `mock_msg_${callCount}` };
  });

  campaignChannelRegistry.__resetTestChannels();
  campaignChannelRegistry.__registerChannelForTest(buildMockDescriptor());

  originalQuotaGate = campaignRunService.channelQuotaGate;
  campaignRunService.channelQuotaGate = createNoopChannelQuotaGate();
});

afterEach(() => {
  campaignShutdownGate.__resetForTest();
  campaignChannelRegistry.__resetTestChannels();
  campaignRunService.channelQuotaGate = originalQuotaGate;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function insertCampaign() {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'PR-A adapter shutdown test', 'email', 'active') RETURNING id`,
    [user.id]
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
    [campaignId, user.id]
  );
  return rows[0];
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

describe('PR-A — shutdown giữa chừng khi đang gửi kênh adapter (mock)', () => {
  it('shutdown sau 2 lần sendOne -> không lượt MỚI nào bắt đầu, run vẫn running, KHÔNG failed', async () => {
    const recipientKeys = Array.from({ length: RECIPIENT_COUNT }, (_, i) => `peer${i + 1}`);
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        recipientSource: 'manual',
        recipientKeys,
        steps: [{ message: 'Bước 1' }],
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, user.id);

    expect(fakeSendOne).toHaveBeenCalledTimes(SHUTDOWN_AT_CALL);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('running');
    expect(runRow.error_message).toBeNull();

    const { rows: sentRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages WHERE id_node = $1 AND status = 'sent'`,
      [nodeId]
    );
    expect(sentRows[0].n).toBe(SHUTDOWN_AT_CALL);

    const drainResult = await campaignShutdownGate.waitForInFlight(5000);
    expect(drainResult).toEqual({ drained: true, remaining: 0 });
  }, 20000);
});
