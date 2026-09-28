import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A — test (c): Zalo cá nhân, shutdown giữa chừng.
 *
 * Khuôn mock API lấy từ messagesWorkspaceOwnerId.test.js ("đường gửi thật (executeCampaign Zalo cá
 * nhân)") — zaloAccountSessionService.setAccountApi(accountId, {sendMessage, findUser}).
 */

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;
const campaignShutdownGate = (await import('../../src/services/campaign/campaignShutdownGate.js')).default;
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

process.env.BULLMQ_ENABLED = 'false';

registerOutboundMessageProcessors();

const RECIPIENT_COUNT = 5;
const SHUTDOWN_AT_CALL = 2;

let user;
let accountId;

beforeEach(async () => {
  await truncateAll();
  campaignShutdownGate.__resetForTest();
  user = await createUser({
    email: `pra_zalo_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
});

afterEach(() => {
  campaignShutdownGate.__resetForTest();
  if (accountId != null) {
    zaloAccountSessionService.clearAccountApi(accountId);
    accountId = null;
  }
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function insertRun(campaignId) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
     VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [campaignId, user.id]
  );
  return rows[0].id;
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

describe('PR-A — shutdown giữa chừng khi đang gửi Zalo cá nhân', () => {
  it('shutdown sau 2 tin -> không tin MỚI nào gửi sau đó, run vẫn running, KHÔNG failed', async () => {
    const { rows: accRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
       VALUES ($1, true, 'connected', 'PR-A Zalo Personal Account') RETURNING id`,
      [user.id]
    );
    accountId = accRows[0].id;

    let callCount = 0;
    const fakeSendMessage = jest.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === SHUTDOWN_AT_CALL) {
        campaignShutdownGate.beginShutdown();
      }
      return { message: { msgId: String(9000 + callCount) } };
    });
    const fakeFindUser = jest.fn().mockImplementation(async (phone) => ({
      uid: `uid_${phone}`,
      zalo_display: `Recipient ${phone}`,
    }));
    zaloAccountSessionService.setAccountApi(accountId, {
      sendMessage: fakeSendMessage,
      findUser: fakeFindUser,
    });

    // Bỏ qua quiet hours + hạ khoảng cách giữa 2 tin về 0 — không liên quan tới PR-A, chỉ để test
    // chạy nhanh (khuôn campaignChannelRegistryPr1.test.js (c)).
    const quietHoursSpy = jest.spyOn(
      campaignRunService.zaloRateLimiter,
      'computeNextAllowedSendAtByQuietHours'
    ).mockReturnValue(null);
    const originalInterMin = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT;
    const originalInterMax = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = 0;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = 0;

    try {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
         VALUES ($1, $1, 'PR-A Zalo personal shutdown test', 'zalo', 'active') RETURNING id`,
        [user.id]
      );
      const campaignId = cRows[0].id;
      const phones = Array.from({ length: RECIPIENT_COUNT }, (_, i) => `090${String(1000000 + i).padStart(7, '0')}`);
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_zalo_personal', 'Send Zalo Personal', $2::jsonb, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientPhones: phones.join(', '),
            zaloAccountId: accountId,
            zaloRecipientType: 'phone',
            message: 'PR-A shutdown test message',
          }),
        ]
      );
      const runId = await insertRun(campaignId);

      await campaignRunService.executeCampaign(campaignId, runId, user.id);

      expect(fakeSendMessage).toHaveBeenCalledTimes(SHUTDOWN_AT_CALL);

      const runRow = await getRunRow(runId);
      expect(runRow.status).toBe('running');
      expect(runRow.error_message).toBeNull();

      const { rows: sentRows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM zalo_messages WHERE id_run = $1 AND tracking_metadata->>'status' = 'sent'`,
        [runId]
      );
      expect(sentRows[0].n).toBe(SHUTDOWN_AT_CALL);

      const drainResult = await campaignShutdownGate.waitForInFlight(5000);
      expect(drainResult).toEqual({ drained: true, remaining: 0 });
    } finally {
      quietHoursSpy.mockRestore();
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = originalInterMin;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = originalInterMax;
    }
  }, 20000);
});
