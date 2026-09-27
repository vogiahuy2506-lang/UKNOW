import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';

/**
 * PR-7b (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — cửa sổ chống trùng liên-run.
 *
 * Hai nhóm test:
 * 1. Repository-level (email + zalo), CSDL thật, gọi thẳng query mới — kiểm chính xác biên cửa sổ
 *    24h + khoá id_node theo matchNode. Khuôn giống recipientLedger.outOfOrder.test.js.
 * 2. Full integration qua campaignRunService.executeCampaign() thật (chỉ mock nodemailer, khuôn
 *    campaignQuotaMatrix.test.js) — chứng minh quyết định matchNode ("chiến dịch có >1 node cùng
 *    kênh") ở TẦNG SERVICE hoạt động đúng, không chỉ ở tầng repository.
 */

const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-pr7b@uknow.test>',
  accepted: ['recipient@example.com'],
});
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const savedInitialEnv = {
  SMTP_SECRET_KEY: process.env.SMTP_SECRET_KEY,
  TEST_SEND_EMAIL: process.env.TEST_SEND_EMAIL,
  BULLMQ_ENABLED: process.env.BULLMQ_ENABLED,
};
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const emailSettingsRepository = (await import('../../src/repositories/email/emailSettings.repository.js')).default;
const zaloMessageRepository = (await import('../../src/repositories/campaign/zaloMessage.repository.js')).default;
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

registerOutboundMessageProcessors();

describe('Integration — PR-7b cửa sổ chống trùng liên-run (CAMPAIGN_CROSS_RUN_DEDUPE_HOURS)', () => {
  let user;

  beforeEach(async () => {
    await truncateAll();
    mockSendMail.mockClear();
    user = await createUser({
      email: `pr7b_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  afterAll(() => {
    for (const [key, val] of Object.entries(savedInitialEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // ── Fixture helpers ─────────────────────────────────────────────────────────

  async function insertCampaign(campaignType = 'email') {
    const { rows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'PR-7b Campaign', $2, 'active') RETURNING id`,
      [user.id, campaignType]
    );
    return rows[0].id;
  }

  async function insertRun(campaignId) {
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
       VALUES ($1, $2, 'manual', 'running') RETURNING id`,
      [campaignId, user.id]
    );
    return rows[0].id;
  }

  async function insertOldEmailMessage({ campaignId, runId, nodeId, recipientEmail, emailStep = 1, hoursAgo }) {
    const { rows } = await db.query(
      `INSERT INTO email_messages (id_campaign, id_run, id_node, recipient_email, email_step, status, sent_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'sent', NOW() - ($6::text || ' hours')::interval, NOW() - ($6::text || ' hours')::interval)
       RETURNING id`,
      [campaignId, runId, nodeId, recipientEmail, emailStep, hoursAgo]
    );
    return rows[0].id;
  }

  async function insertOldZaloMessage({ campaignId, runId, nodeId, channel, recipientValue, stepIndex = 1, hoursAgo }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_messages (
         id_campaign, id_run, id_node, channel, recipient_type, recipient_value, tracking_token,
         tracking_metadata, sent_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'phone', $5, $6, $7::jsonb,
         NOW() - ($8::text || ' hours')::interval, NOW() - ($8::text || ' hours')::interval, NOW()
       ) RETURNING id`,
      [
        campaignId, runId, nodeId, channel, recipientValue,
        `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        JSON.stringify({ status: 'sent', stepIndex }),
        hoursAgo,
      ]
    );
    return rows[0].id;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Repository-level — query mới chạy thật trên CSDL 5433
  // ═════════════════════════════════════════════════════════════════════════

  describe('emailSettingsRepository.findExistingSentCampaignEmailCrossRun', () => {
    it('run A sent 2h trước, run B tra trong cửa sổ 24h, matchNode=false → tìm thấy', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_2h_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 2 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        recipientEmail,
        emailStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 999, // KHÔNG khớp id_node của dòng cũ — vẫn phải tìm thấy vì matchNode=false
        matchNode: false,
      });

      expect(found).not.toBeNull();
      expect(found.id_run).toBe(runA);
    });

    it('run A sent 25h trước (ngoài cửa sổ 24h) → không tìm thấy', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_25h_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 25 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        recipientEmail,
        emailStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 111,
        matchNode: false,
      });

      expect(found).toBeNull();
    });

    it('matchNode=true, id_node khớp → tìm thấy; id_node không khớp → không tìm thấy', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_matchnode_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 222, recipientEmail, hoursAgo: 2 });

      const foundMatching = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        recipientEmail,
        emailStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 222,
        matchNode: true,
      });
      expect(foundMatching).not.toBeNull();

      const foundMismatch = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        recipientEmail,
        emailStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 333,
        matchNode: true,
      });
      expect(foundMismatch).toBeNull();
    });
  });

  describe('zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun', () => {
    it('run A sent 2h trước, run B tra trong cửa sổ 24h, matchNode=false → tìm thấy', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0900${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 111, channel: 'zalo_personal', recipientValue: phone, hoursAgo: 2,
      });

      const found = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        channel: 'zalo_personal',
        recipientKey: phone,
        zaloStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 999,
        matchNode: false,
      });

      expect(found).not.toBeNull();
      expect(found.id_run).toBe(runA);
    });

    it('run A sent 25h trước (ngoài cửa sổ 24h) → không tìm thấy', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0901${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 111, channel: 'zalo_personal', recipientValue: phone, hoursAgo: 25,
      });

      const found = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        channel: 'zalo_personal',
        recipientKey: phone,
        zaloStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 111,
        matchNode: false,
      });

      expect(found).toBeNull();
    });

    it('matchNode=true, id_node khớp → tìm thấy; id_node không khớp → không tìm thấy', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0902${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 222, channel: 'zalo_friend_request', recipientValue: phone, hoursAgo: 2,
      });

      const foundMatching = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        channel: 'zalo_friend_request',
        recipientKey: phone,
        zaloStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 222,
        matchNode: true,
      });
      expect(foundMatching).not.toBeNull();

      const foundMismatch = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        channel: 'zalo_friend_request',
        recipientKey: phone,
        zaloStep: 1,
        sentSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        nodeId: 333,
        matchNode: true,
      });
      expect(foundMismatch).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Full integration qua campaignRunService.executeCampaign() thật (send_email)
  //    — chứng minh quyết định matchNode ở TẦNG SERVICE (đếm node cùng kênh) đúng.
  // ═════════════════════════════════════════════════════════════════════════

  describe('send_email node qua executeCampaign() thật', () => {
    async function setupEmailCampaign() {
      const campaignId = await insertCampaign('email');
      const senderEmail = `pr7b_sender_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
      const { rows: sRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'PR-7b Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true) RETURNING id`,
        [user.id, senderEmail, encryptSmtpSecret('secret123')]
      );
      return { campaignId, emailSettingId: sRows[0].id };
    }

    async function insertEmailNode(campaignId, { recipientEmails, executionOrder, fromEmailId }) {
      const { rows } = await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, $3) RETURNING id`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails,
            fromEmailId,
            emailSubject: 'PR-7b Subject',
            emailBody: '<p>Body</p>',
          }),
          executionOrder,
        ]
      );
      return rows[0].id;
    }

    it('run B trong 2h → bỏ qua (lưu flow đổi id_node giữa 2 lượt vẫn bỏ qua vì chiến dịch chỉ có 1 node/kênh)', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_2h_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });

      const runA = await insertRun(campaignId);
      // id_node CỐ Ý khác node hiện tại — mô phỏng lưu flow giữa run A và B đổi hết id_node.
      await insertOldEmailMessage({
        campaignId, runId: runA, nodeId: nodeId + 987654, recipientEmail, hoursAgo: 2,
      });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).not.toHaveBeenCalled();
      const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM email_messages WHERE id_run = $1', [runB]);
      expect(rows[0].c).toBe(0);
    }, 20000);

    it('run B sau 25h → cửa sổ hết hạn, gửi lại bình thường', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_25h_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });

      const runA = await insertRun(campaignId);
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId, recipientEmail, hoursAgo: 25 });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    }, 20000);

    it('chiến dịch có 2 node send_email, id_node KHỚP → vẫn bỏ qua', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_2node_match_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });
      // Node thứ 2 cùng kênh — không recipient, không chạy thật, chỉ để nâng số node send_email
      // của chiến dịch lên 2 (kích hoạt nhánh "khoá thêm id_node" ở phía service).
      await insertEmailNode(campaignId, { recipientEmails: '', executionOrder: 2, fromEmailId: emailSettingId });

      const runA = await insertRun(campaignId);
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId, recipientEmail, hoursAgo: 2 });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).not.toHaveBeenCalled();
    }, 20000);

    it('chiến dịch có 2 node send_email, id_node KHÔNG khớp → gửi lại (không lấy nhầm ledger của node khác)', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_2node_mismatch_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });
      await insertEmailNode(campaignId, { recipientEmails: '', executionOrder: 2, fromEmailId: emailSettingId });

      const runA = await insertRun(campaignId);
      // Dòng cũ do NODE KHÁC gửi (id_node không khớp node đang chạy thật).
      await insertOldEmailMessage({
        campaignId, runId: runA, nodeId: nodeId + 555555, recipientEmail, hoursAgo: 2,
      });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    }, 20000);
  });
});
