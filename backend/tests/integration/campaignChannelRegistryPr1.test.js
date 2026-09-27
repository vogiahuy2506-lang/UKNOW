/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-1 — Registry kênh + cầu dao node gửi lạ.
 *
 * (a) preflight campaign có node action|send_whatsapp (registry không biết) → 400 UNSUPPORTED_SEND_NODE.
 * (b) chạy engine thật cho campaign đó → run failed, 0 dòng email_messages/zalo_messages,
 *     execution log của node đó = failed (KHÔNG rơi vào default log 'success' cũ).
 * (c) campaign nhóm action|send_zalo_group chạy continuous → node ĐƯỢC chạy ở chu kỳ replay
 *     (ghim sửa bug R:3335 — trước đây thiếu send_zalo_group nên bị bỏ qua ở mọi chu kỳ >0).
 * (d) campaign có action|wait_time + 1 node gửi thật (send_email) → chạy bình thường, wait_time
 *     vẫn bị bỏ qua im lặng như cũ (không đổi hành vi node không-phải-gửi).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<pr1-test@uknow.test>',
  accepted: ['recipient@example.com'],
});
const mockCreateTransport = jest.fn().mockReturnValue({ verify: mockVerify, sendMail: mockSendMail });
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { validateCampaignPreflight } = await import('../../src/services/campaign/campaignPreflight.service.js');
const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

registerOutboundMessageProcessors();

/** Chờ tới khi `check()` trả true hoặc hết `timeoutMs` (poll mỗi 50ms). */
async function waitUntil(check, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await check()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

let user;
const activeFakeZaloAccountIds = [];

beforeEach(async () => {
  await truncateAll();
  mockVerify.mockClear().mockResolvedValue(true);
  mockSendMail.mockClear().mockResolvedValue({
    messageId: '<pr1-test@uknow.test>',
    accepted: ['recipient@example.com'],
  });
  mockCreateTransport.mockClear().mockReturnValue({ verify: mockVerify, sendMail: mockSendMail });
  user = await createUser({
    email: `pr1_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
});

afterEach(() => {
  while (activeFakeZaloAccountIds.length) {
    zaloAccountSessionService.clearAccountApi(activeFakeZaloAccountIds.pop());
  }
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function insertCampaign({ campaignType = 'email', campaignName = 'PR-1 test' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, $3, 'active') RETURNING id`,
    [user.id, campaignName, campaignType]
  );
  return rows[0].id;
}

async function insertNode({ campaignId, subtype, nodeType = 'action', config = {}, order = 1 }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, $2, $3, $3, $4::jsonb, $5) RETURNING *`,
    [campaignId, nodeType, subtype, JSON.stringify(config), order]
  );
  return rows[0];
}

async function insertRun({ campaignId, status = 'running', runMetadata = null }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', $3, COALESCE($4::jsonb, '{}'::jsonb)) RETURNING *`,
    [campaignId, user.id, status, runMetadata ? JSON.stringify(runMetadata) : null]
  );
  return rows[0];
}

describe('PR-1 — Registry kênh + cầu dao node gửi lạ', () => {
  it('(a) preflight campaign có node action|send_whatsapp → 400 UNSUPPORTED_SEND_NODE', async () => {
    const campaignId = await insertCampaign({ campaignType: 'email' });
    await insertNode({ campaignId, subtype: 'send_whatsapp' });

    await expect(validateCampaignPreflight({ campaignId })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SEND_NODE',
      statusCode: 400,
    });
  });

  it('(b) run có node action|send_whatsapp → run failed, 0 dòng email_messages/zalo_messages, execution log node failed', async () => {
    const campaignId = await insertCampaign({ campaignType: 'email' });
    const node = await insertNode({ campaignId, subtype: 'send_whatsapp' });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, user.id);

    const { rows: runRows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [run.id]);
    expect(runRows[0].status).toBe('failed');
    expect(String(runRows[0].error_message || '')).toMatch(/send_whatsapp/);

    const { rows: emailRows } = await db.query('SELECT COUNT(*)::int AS n FROM email_messages WHERE id_run = $1', [run.id]);
    expect(emailRows[0].n).toBe(0);
    const { rows: zaloRows } = await db.query('SELECT COUNT(*)::int AS n FROM zalo_messages WHERE id_run = $1', [run.id]);
    expect(zaloRows[0].n).toBe(0);

    const { rows: execRows } = await db.query(
      'SELECT status, error_message FROM campaign_executions WHERE id_run = $1 AND node_id = $2',
      [run.id, String(node.id)]
    );
    expect(execRows).toHaveLength(1);
    expect(execRows[0].status).toBe('failed');
    expect(String(execRows[0].error_message || '')).toMatch(/send_whatsapp/);
  });

  it('(d) campaign có action|wait_time + 1 node gửi thật (send_email) → chạy bình thường, wait_time vẫn bị bỏ qua im lặng', async () => {
    const campaignId = await insertCampaign({ campaignType: 'email' });
    const senderEmail = `pr1_sender_${Date.now()}@example.com`;
    const { rows: settingsRows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
       VALUES ($1, 'PR1 Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true)
       RETURNING id`,
      [user.id, senderEmail, encryptSmtpSecret('secret123')]
    );
    const emailSettingId = settingsRows[0].id;
    const recipientEmail = `pr1_recipient_${Date.now()}@example.com`;
    await db.query(
      `INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, 'PR1 Recipient')`,
      [user.id, recipientEmail]
    );

    await insertNode({ campaignId, subtype: 'wait_time', config: { waitMinutes: 5 }, order: 1 });
    await insertNode({
      campaignId,
      subtype: 'send_email',
      order: 2,
      config: {
        recipientSource: 'manual',
        recipientEmails: recipientEmail,
        fromEmailId: emailSettingId,
        emailSubject: 'PR-1 wait_time passthrough',
        emailBody: '<p>PR-1 wait_time passthrough</p>',
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, user.id);

    const { rows: runRows } = await db.query('SELECT status FROM campaign_runs WHERE id = $1', [run.id]);
    expect(runRows[0].status).toBe('completed');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const { rows: emailRows } = await db.query('SELECT COUNT(*)::int AS n FROM email_messages WHERE id_run = $1', [run.id]);
    expect(emailRows[0].n).toBe(1);
  });

  it('(c) campaign nhóm action|send_zalo_group chạy continuous → node ĐƯỢC chạy ở chu kỳ replay (ghim sửa bug R:3335)', async () => {
    // Ân hạn khung giờ yên lặng — không phụ thuộc giờ chạy test thật (đọc thẳng property trên
    // singleton, khuôn campaignRunZaloQuotaBoundary.spec.js:133-134).
    const originalQuietStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
    const originalQuietEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24; // 24 = không bao giờ quiet
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;
    // Policy khoảng cách giữa 2 tin nhắn nhóm mặc định 20–50 GIÂY (production) — không liên quan
    // gì tới đúng/sai của PR-1, chỉ là policy pacing chung; hạ về 0 để test chạy trong vài giây.
    const originalInterMin = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT;
    const originalInterMax = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = 0;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = 0;
    // Poll interval continuous mặc định random 120-300 PHÚT (đợi thật không nổi trong test) — sàn
    // cứng nextSleepMs là Math.max(1000, ...) nên không thể xuống dưới 1 giây, nhưng monkey-patch
    // nguồn random về nhỏ để KHÔNG rơi vào nhánh configuredContinuousPollIntervalMs (sàn 60s).
    const originalGetRandomInterval = campaignRunService.getRandomContinuousPollIntervalMs;
    campaignRunService.getRandomContinuousPollIntervalMs = () => 100;

    try {
      const { rows: accRows } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
         VALUES ($1, true, 'connected', 'PR1 Zalo Group Account') RETURNING id`,
        [user.id]
      );
      const accountId = accRows[0].id;
      // msgId PHẢI là chuỗi số dương thuần (POSITIVE_MSG_ID_RE ở zaloDispatchDelivery.util.js) —
      // tiền tố chữ như `pr1_...` bị coi là "Zalo không xác nhận phát tin" (ZALO_SILENT_DROP).
      let fakeMsgIdSeq = 2001;
      const fakeSendMessage = jest.fn().mockImplementation(async () => ({
        message: { msgId: String(fakeMsgIdSeq++) },
      }));
      zaloAccountSessionService.setAccountApi(accountId, {
        // groups rỗng → guard "groupIdSet.size > 0 && !groupIdSet.has(groupId)" không chặn nhóm test.
        getAllGroups: async () => ({ groups: [] }),
        sendMessage: fakeSendMessage,
      });
      activeFakeZaloAccountIds.push(accountId);

      const { rows: tplRows } = await db.query(
        `INSERT INTO zalo_templates (id_user, template_name, body_text)
         VALUES ($1, 'PR1 Group Step 1', 'Nội dung bước 1'), ($1, 'PR1 Group Step 2', 'Nội dung bước 2')
         RETURNING id`,
        [user.id]
      );
      const [templateId1, templateId2] = tplRows.map((r) => r.id);

      const campaignId = await insertCampaign({ campaignType: 'zalo' });
      const groupId = `pr1_group_${Date.now()}`;
      const node = await insertNode({
        campaignId,
        subtype: 'send_zalo_group',
        config: {
          zaloAccountId: accountId,
          zaloGroupSource: 'manual',
          zaloGroupIds: groupId,
          zaloGroupTemplateSteps: [{ templateId: templateId1 }, { templateId: templateId2 }],
        },
      });
      const run = await insertRun({ campaignId, runMetadata: { continuousMode: true } });

      const runPromise = campaignRunService.executeCampaign(campaignId, run.id, user.id);

      // Chờ đủ 2 dòng zalo_messages (2 bước, 2 chu kỳ) rồi mới dừng run — tối đa 15s (2 chu kỳ ×
      // sàn ~1-1.3s/chu kỳ + thời gian gửi/log bình thường dưới 2s, số dư lớn phòng máy chậm/tải).
      const got2Sends = await waitUntil(async () => {
        const { rows } = await db.query(
          `SELECT COUNT(*)::int AS n FROM zalo_messages WHERE id_run = $1 AND id_node = $2`,
          [run.id, node.id]
        );
        return rows[0].n >= 2;
      }, 15000);

      await db.query(`UPDATE campaign_runs SET status = 'stopped' WHERE id = $1`, [run.id]);
      await runPromise;

      expect(got2Sends).toBe(true);
      expect(fakeSendMessage).toHaveBeenCalledTimes(2);

      const { rows: msgRows } = await db.query(
        `SELECT tracking_metadata->>'status' AS status, tracking_metadata->>'stepIndex' AS step
         FROM zalo_messages WHERE id_run = $1 AND id_node = $2 ORDER BY id ASC`,
        [run.id, node.id]
      );
      // Review 27/09: bootstrap customer_journey.id_customer đã cho NULL như production, nên tin nhóm
      // không còn bị ghi đè 'failed' sau khi gửi. Ghim ĐÚNG ý ca này: chu kỳ đầu gửi bước 1, chu kỳ
      // replay gửi bước 2 — không phải bước 1 bị gửi lại lần hai.
      expect(msgRows).toEqual([
        { status: 'sent', step: '1' },
        { status: 'sent', step: '2' },
      ]);
    } finally {
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = originalQuietStart;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = originalQuietEnd;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = originalInterMin;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = originalInterMax;
      campaignRunService.getRandomContinuousPollIntervalMs = originalGetRandomInterval;
    }
  }, 20000);
});
