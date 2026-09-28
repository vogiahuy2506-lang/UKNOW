import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A — test (a)+(b): run email 50 người one-shot, shutdown
 * giữa chừng không mở lượt gửi mới, lượt đang bay ghi xong; resume CÙNG run gửi đúng phần còn lại.
 *
 * Khuôn lấy từ campaignCrossRunDedupe.test.js ("Full integration qua campaignRunService.executeCampaign()
 * thật, chỉ mock nodemailer").
 */

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});
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
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const campaignShutdownGate = (await import('../../src/services/campaign/campaignShutdownGate.js')).default;
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

registerOutboundMessageProcessors();

const RECIPIENT_COUNT = 50;
const SHUTDOWN_AT_CALL = 10;
const SEND_DELAY_MS = 200;

let user;

beforeEach(async () => {
  await truncateAll();
  campaignShutdownGate.__resetForTest();
  mockSendMail.mockReset();
  mockCreateTransport.mockClear().mockReturnValue({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: mockSendMail,
  });
  user = await createUser({
    email: `pra_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
});

afterEach(() => {
  campaignShutdownGate.__resetForTest();
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function setupEmailCampaign() {
  const { rows: cRows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'PR-A email shutdown test', 'email', 'active') RETURNING id`,
    [user.id]
  );
  const campaignId = cRows[0].id;
  const senderEmail = `pra_sender_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { rows: sRows } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
     VALUES ($1, 'PR-A Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true) RETURNING id`,
    [user.id, senderEmail, encryptSmtpSecret('secret123')]
  );
  return { campaignId, emailSettingId: sRows[0].id };
}

async function insertEmailNode(campaignId, { recipientEmails, fromEmailId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Send Email', $2, 1) RETURNING id`,
    [
      campaignId,
      JSON.stringify({
        recipientSource: 'manual',
        recipientEmails,
        fromEmailId,
        emailSubject: 'PR-A Subject',
        emailBody: '<p>Body</p>',
      }),
    ]
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

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PR-A — shutdown giữa chừng khi đang gửi email one-shot (50 người)', () => {
  it('(a) shutdown sau ~10 tin -> không lượt MỚI nào bắt đầu, lượt đang bay ghi xong, run vẫn running, KHÔNG failed; (b) resume CÙNG run -> gửi đúng 40 người còn lại, tổng 50 dòng, 0 trùng', async () => {
    const { campaignId, emailSettingId } = await setupEmailCampaign();
    const recipients = Array.from({ length: RECIPIENT_COUNT }, (_, i) => `pra_recipient_${i + 1}_${Date.now()}@example.com`);
    const nodeId = await insertEmailNode(campaignId, {
      recipientEmails: recipients.join(', '),
      fromEmailId: emailSettingId,
    });
    const runId = await insertRun(campaignId);

    let callCount = 0;
    let midFlightCheckDone = false;
    let midFlightResult = null;
    mockSendMail.mockImplementation(async () => {
      callCount += 1;
      if (callCount === SHUTDOWN_AT_CALL) {
        // Gọi NGAY khi lượt thứ 10 BẮT ĐẦU (trước khi nó xong) — mô phỏng đúng "đang bay" của
        // đề bài: lượt #10 phải ghi xong dù cờ shutdown đã bật; lượt #11 trở đi không được bắt đầu.
        campaignShutdownGate.beginShutdown();
        // Đo NGAY LÚC NÀY (trackInFlight của lượt #10 đã tăng đếm — mock này CHẠY BÊN TRONG lời
        // gọi đã bọc trackInFlight). waitForInFlight(0) không polling (deadline = ngay bây giờ)
        // nên đọc đúng inFlightCount tại thời điểm gọi, không rơi vào đợi tự nhiên của JS await
        // (đó là lý do đo SAU KHI executeCampaign() resolve không bắt được đột biến "bỏ
        // trackInFlight" — lúc đó lượt nào cũng đã xong, đếm có tăng hay không đều không lộ ra).
        midFlightResult = await campaignShutdownGate.waitForInFlight(0);
        midFlightCheckDone = true;
      }
      await sleep(SEND_DELAY_MS);
      return { messageId: `<pra-${callCount}@uknow.test>`, accepted: ['recipient@example.com'] };
    });

    // ── Phase (a) ──────────────────────────────────────────────────────────
    await campaignRunService.executeCampaign(campaignId, runId, user.id);

    expect(mockSendMail).toHaveBeenCalledTimes(SHUTDOWN_AT_CALL);
    expect(midFlightCheckDone).toBe(true);
    // Lượt #10 đang ngủ (200ms) khi waitForInFlight(50) chạy — PHẢI thấy remaining=1/drained=false.
    // Đột biến "bỏ trackInFlight" làm bộ đếm luôn = 0 nên assertion này sẽ đỏ đúng như dự kiến.
    expect(midFlightResult).toEqual({ drained: false, remaining: 1 });

    const runAfterA = await getRunRow(runId);
    expect(runAfterA.status).toBe('running');
    expect(runAfterA.error_message).toBeNull();

    const { rows: sentRowsA } = await db.query(
      `SELECT COUNT(*)::int AS n FROM email_messages WHERE id_run = $1 AND status = 'sent'`,
      [runId]
    );
    expect(sentRowsA[0].n).toBe(SHUTDOWN_AT_CALL);

    const drainResult = await campaignShutdownGate.waitForInFlight(5000);
    expect(drainResult).toEqual({ drained: true, remaining: 0 });

    // ── Phase (b): resume CÙNG run ───────────────────────────────────────────
    campaignShutdownGate.__resetForTest();
    mockSendMail.mockReset();
    let resumeCallCount = 0;
    mockSendMail.mockImplementation(async () => {
      resumeCallCount += 1;
      return { messageId: `<pra-resume-${resumeCallCount}@uknow.test>`, accepted: ['recipient@example.com'] };
    });
    await db.query(`UPDATE campaign_runs SET status = 'running' WHERE id = $1`, [runId]);

    await campaignRunService.executeCampaign(campaignId, runId, user.id);

    expect(mockSendMail).toHaveBeenCalledTimes(RECIPIENT_COUNT - SHUTDOWN_AT_CALL);

    const { rows: totalRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM email_messages WHERE id_run = $1 AND status = 'sent'`,
      [runId]
    );
    expect(totalRows[0].n).toBe(RECIPIENT_COUNT);

    const { rows: dupRows } = await db.query(
      `SELECT recipient_email, COUNT(*)::int AS n FROM email_messages
       WHERE id_run = $1 AND status = 'sent'
       GROUP BY recipient_email HAVING COUNT(*) > 1`,
      [runId]
    );
    expect(dupRows).toHaveLength(0);

    const { rows: ledgerRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND is_fully_completed = true`,
      [runId, String(nodeId)]
    );
    expect(ledgerRows[0].n).toBe(RECIPIENT_COUNT);

    const runAfterB = await getRunRow(runId);
    expect(runAfterB.status).toBe('completed');
    const { successful_sends: ok, failed_sends: bad, skipped_sends: sk, total_recipients: total } = runAfterB;
    expect(ok + bad + sk).toBeLessThanOrEqual(total);
  }, 30000);
});
