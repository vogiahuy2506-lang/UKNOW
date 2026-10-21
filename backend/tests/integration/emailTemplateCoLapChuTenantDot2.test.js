/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 A1 — mẫu email phải thuộc chủ chiến dịch và KHÔNG BAO GIỜ gửi email chung chung khi thiếu mẫu.
 *
 *  - Lọc chủ: node của chiến dịch A trỏ mẫu của B -> preflight 400 EMAIL_TEMPLATE_UNAVAILABLE (HTTP chạy ngay + bật lịch), không
 *    có lượt chạy, không email nào gửi.
 *  - Lưới an toàn: mẫu bị xoá SAU preflight (giữa lượt chạy) -> engine THẬT không gửi email nào (không còn "Thông báo từ Founder AI"
 *    / "Email từ Founder AI"), mỗi người nhận có bản ghi thất bại kèm lý do rõ, lượt chạy kết thúc (không treo chờ thử lại).
 *  - Mẫu của chính A -> gửi như cũ; node soạn thẳng nội dung (không templateId) -> gửi như cũ.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn();
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.BULLMQ_ENABLED = 'false';

const { default: request } = await import('supertest');
const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const campaignEmailSenderService = (await import('../../src/services/campaign/campaignEmailSender.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

registerOutboundMessageProcessors();

let app;
const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

beforeEach(async () => {
  app = app || createApp();
  await truncateAll();
  // Cache theo (runId, nodeId) sống trong bộ nhớ; truncateAll RESTART IDENTITY nên id lặp lại giữa các ca — dọn để ca sau không đọc "mẫu null" của ca trước.
  campaignEmailSenderService.runNodeCache.clear();
  mockSendMail.mockReset().mockResolvedValue({ messageId: '<tpl@uknow.test>', accepted: ['x@example.com'] });
  mockCreateTransport.mockReset().mockReturnValue({ verify: jest.fn().mockResolvedValue(true), sendMail: mockSendMail });
});

afterEach(() => {
  jest.restoreAllMocks();
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function createTenant(label) {
  const user = await createUser({ username: `tpl_${label}_${rnd()}`, email: `tpl_${label}_${rnd()}@example.com` });
  const { rows: sender } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
     VALUES ($1, 'Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true) RETURNING id`,
    [user.id, `sender_${label}_${rnd()}@example.com`, encryptSmtpSecret('secret123')]
  );
  const login = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return { user, senderId: Number(sender[0].id), token: login.body.data.accessToken };
}

async function insertTemplate(ownerId, subject, html) {
  const { rows } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html, body_text) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
    [ownerId, `Mau ${subject}`, subject, html]
  );
  return Number(rows[0].id);
}

async function insertCampaignWithEmailNode(tenant, nodeConfig, { recipients = 'nguoi1@example.com, nguoi2@example.com' } = {}) {
  const { rows: campaign } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'Chien dich mau email', 'email', 'active') RETURNING id`,
    [tenant.user.id]
  );
  const campaignId = Number(campaign[0].id);
  const { rows: node } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', 'send_email', 'Gui email chao', $2::jsonb, 1) RETURNING id`,
    [campaignId, JSON.stringify({ recipientSource: 'manual', recipientEmails: recipients, fromEmailId: tenant.senderId, ...nodeConfig })]
  );
  return { campaignId, nodeId: Number(node[0].id) };
}

async function insertRun(campaignId, ownerId) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status) VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [campaignId, ownerId]
  );
  return Number(rows[0].id);
}

const countRuns = async (campaignId) =>
  (await db.query('SELECT COUNT(*)::int AS n FROM campaign_runs WHERE id_campaign = $1', [campaignId])).rows[0].n;

describe('preflight: mẫu của tenant khác / đã xoá -> EMAIL_TEMPLATE_UNAVAILABLE', () => {
  it('chiến dịch A trỏ mẫu của B -> POST /campaigns/:id/run trả 400 EMAIL_TEMPLATE_UNAVAILABLE nêu tên node; không lượt chạy, không email', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const templateOfB = await insertTemplate(b.user.id, 'MAU_RIENG_CUA_B', '<p>BI_MAT_CUA_B</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateOfB });
    const execute = jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();

    const res = await request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${a.token}`).send({ source: 'campaign_run' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'EMAIL_TEMPLATE_UNAVAILABLE' });
    expect(res.body.message).toContain('Gui email chao');
    expect(JSON.stringify(res.body)).not.toContain('BI_MAT_CUA_B');
    expect(await countRuns(campaignId)).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('mẫu đã bị xoá (id không còn) -> 400 EMAIL_TEMPLATE_UNAVAILABLE', async () => {
    const a = await createTenant('A');
    const templateId = await insertTemplate(a.user.id, 'MAU_DA_XOA', '<p>x</p>');
    await db.query('DELETE FROM email_templates WHERE id = $1', [templateId]);
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateId });

    const res = await request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${a.token}`).send({ source: 'campaign_run' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    expect(await countRuns(campaignId)).toBe(0);
  });

  it('mẫu của một BƯỚC email (emailSteps) thuộc tenant khác -> cũng bị chặn', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const own = await insertTemplate(a.user.id, 'MAU_A', '<p>a</p>');
    const foreign = await insertTemplate(b.user.id, 'MAU_B', '<p>b</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailSteps: [{ templateId: own }, { templateId: foreign }] });

    const res = await request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${a.token}`).send({ source: 'campaign_run' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
  });

  it('mẫu của CHÍNH A -> preflight qua, lượt chạy được tạo (200)', async () => {
    const a = await createTenant('A');
    const own = await insertTemplate(a.user.id, 'MAU_CUA_A', '<p>a</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: own });
    jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();

    const res = await request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${a.token}`).send({ source: 'campaign_run' });

    expect(res.status).toBe(200);
    expect(await countRuns(campaignId)).toBe(1);
  });

  it('node soạn thẳng nội dung (không templateId) -> qua như cũ', async () => {
    const a = await createTenant('A');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailSubject: 'Chu de tu soan', emailBody: '<p>x</p>' });
    jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();

    const res = await request(app).post(`/api/campaigns/${campaignId}/run`).set('Authorization', `Bearer ${a.token}`).send({ source: 'campaign_run' });

    expect(res.status).toBe(200);
  });

  it('bật lịch cho chiến dịch trỏ mẫu của tenant khác -> bị chặn cùng mã (preflight chung cho lịch)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const foreign = await insertTemplate(b.user.id, 'MAU_B', '<p>b</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: foreign });

    const res = await request(app).post('/api/campaign-schedules').set('Authorization', `Bearer ${a.token}`)
      .send({ campaignId, scheduleName: 'Lich', scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    const { rows } = await db.query('SELECT 1 FROM campaign_schedules WHERE id_campaign = $1', [campaignId]);
    expect(rows).toHaveLength(0);
  });
});

describe('engine thật: mẫu biến mất SAU preflight (giữa lượt chạy) -> không gửi email chung chung', () => {
  const GENERIC = ['Thông báo từ Founder AI', 'Email từ Founder AI'];

  it('mẫu bị xoá sau khi bắt đầu chạy -> 0 email gửi, mỗi người nhận một bản ghi thất bại nêu lý do, lượt chạy kết thúc không treo', async () => {
    const a = await createTenant('A');
    const templateId = await insertTemplate(a.user.id, 'MAU_SE_BI_XOA', '<p>NOI_DUNG_MAU</p>');
    const { campaignId, nodeId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateId });
    const runId = await insertRun(campaignId, a.user.id);
    await db.query('DELETE FROM email_templates WHERE id = $1', [templateId]);

    await campaignRunService.executeCampaign(campaignId, runId, a.user.id);

    expect(mockSendMail).not.toHaveBeenCalled();
    const { rows: messages } = await db.query('SELECT subject, body_html, status FROM email_messages WHERE id_run = $1', [runId]);
    expect(messages).toHaveLength(0);
    for (const text of GENERIC) expect(JSON.stringify(messages)).not.toContain(text);

    const { rows: logs } = await db.query(
      `SELECT status, error_message, execution_data FROM campaign_executions WHERE id_run = $1 AND node_id = $2`,
      [runId, String(nodeId)]
    );
    const failedLogs = logs.filter((row) => row.status === 'failed');
    expect(failedLogs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs)).toMatch(/đã bị xoá hoặc không thuộc tài khoản này/);
    expect(JSON.stringify(logs)).toContain('email_template_unavailable');

    const { rows: runRows } = await db.query('SELECT status, failed_sends, successful_sends, run_metadata FROM campaign_runs WHERE id = $1', [runId]);
    expect(runRows[0].status).toBe('completed');
    expect(runRows[0].failed_sends).toBe(2);
    expect(runRows[0].successful_sends).toBe(0);
    // Lỗi vĩnh viễn: không đánh dấu chờ thử lại (không có hẹn gửi lại / tạm dừng chờ).
    expect(JSON.stringify(runRows[0].run_metadata || {})).not.toMatch(/retry|Retry|deferred|Deferred/);
  }, 30000);

  it('chạy LIÊN TỤC (continuous): mẫu bị xoá -> mỗi người nhận được đánh dấu XONG (is_fully_completed, không hẹn gửi lại), không email nào gửi — không thử lại vô hạn', async () => {
    const a = await createTenant('A');
    const templateId = await insertTemplate(a.user.id, 'MAU_SE_BI_XOA', '<p>NOI_DUNG_MAU</p>');
    const { campaignId, nodeId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateId });
    const { rows: runRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
       VALUES ($1, $2, 'manual', 'running', $3::jsonb) RETURNING id`,
      [campaignId, a.user.id, JSON.stringify({ continuousMode: true, pollIntervalMs: 60 * 1000 })]
    );
    const runId = Number(runRows[0].id);
    await db.query('DELETE FROM email_templates WHERE id = $1', [templateId]);

    const runPromise = campaignRunService.executeCampaign(campaignId, runId, a.user.id);
    let ledger = [];
    try {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        ledger = (await db.query(
          `SELECT recipient_key, last_completed_step, is_fully_completed, meta FROM campaign_run_recipient_steps WHERE id_run = $1 AND id_node = $2`,
          [runId, String(nodeId)]
        )).rows;
        if (ledger.length === 2 && ledger.every((row) => row.is_fully_completed)) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } finally {
      await db.query(`UPDATE campaign_runs SET status = 'stopped' WHERE id = $1`, [runId]);
      await runPromise;
    }

    expect(ledger).toHaveLength(2);
    for (const row of ledger) {
      expect(row.is_fully_completed).toBe(true);
      // KHÔNG còn mốc hẹn gửi lại (nextDueAt) và không có bộ đếm thử lại.
      expect(row.meta?.nextDueAt ?? null).toBeNull();
      expect(row.meta?.retryCount ?? null).toBeNull();
    }
    expect(mockSendMail).not.toHaveBeenCalled();
    const { rows: messages } = await db.query('SELECT 1 FROM email_messages WHERE id_run = $1', [runId]);
    expect(messages).toHaveLength(0);
  }, 60000);

  it('mẫu của tenant khác (chèn tay, bỏ qua preflight) -> engine cũng KHÔNG gửi nội dung mẫu của B, cũng không gửi mặc định', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const templateOfB = await insertTemplate(b.user.id, 'MAU_RIENG_CUA_B', '<p>BI_MAT_CUA_B</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateOfB });
    const runId = await insertRun(campaignId, a.user.id);

    await campaignRunService.executeCampaign(campaignId, runId, a.user.id);

    expect(mockSendMail).not.toHaveBeenCalled();
    const { rows: messages } = await db.query('SELECT 1 FROM email_messages WHERE id_run = $1', [runId]);
    expect(messages).toHaveLength(0);
    const { rows: logs } = await db.query('SELECT error_message, execution_data FROM campaign_executions WHERE id_run = $1', [runId]);
    expect(JSON.stringify(logs)).not.toContain('BI_MAT_CUA_B');
    expect(JSON.stringify(logs)).not.toContain('MAU_RIENG_CUA_B');
  }, 30000);

  it('mẫu của CHÍNH A -> gửi như cũ bằng tiêu đề/nội dung của mẫu', async () => {
    const a = await createTenant('A');
    const templateId = await insertTemplate(a.user.id, 'TIEU_DE_MAU_CUA_A', '<p>NOI_DUNG_MAU_CUA_A</p>');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailTemplateId: templateId });
    const runId = await insertRun(campaignId, a.user.id);

    await campaignRunService.executeCampaign(campaignId, runId, a.user.id);

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ subject: 'TIEU_DE_MAU_CUA_A' });
    expect(mockSendMail.mock.calls[0][0].html).toContain('NOI_DUNG_MAU_CUA_A');
    const { rows: runRows } = await db.query('SELECT status, failed_sends, successful_sends FROM campaign_runs WHERE id = $1', [runId]);
    expect(runRows[0]).toMatchObject({ status: 'completed', failed_sends: 0, successful_sends: 2 });
  }, 30000);

  it('node soạn thẳng nội dung (không templateId) -> engine gửi như cũ', async () => {
    const a = await createTenant('A');
    const { campaignId } = await insertCampaignWithEmailNode(a, { emailSubject: 'CHU_DE_TU_SOAN', emailBody: '<p>NOI_DUNG_TU_SOAN</p>' });
    const runId = await insertRun(campaignId, a.user.id);

    await campaignRunService.executeCampaign(campaignId, runId, a.user.id);

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ subject: 'CHU_DE_TU_SOAN' });
  }, 30000);
});
