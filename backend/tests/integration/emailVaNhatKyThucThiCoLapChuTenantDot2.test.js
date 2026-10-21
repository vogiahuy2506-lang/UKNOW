/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-B — ghi log gửi email với id do client gửi.
 *
 *  - B1: gửi email thử/trực tiếp (`sendCustomEmail`, điểm vào của `POST /email-settings/send-email`) kèm customerId /
 *    emailTemplateId / runId / campaignId của TENANT KHÁC -> email vẫn gửi được nhưng các cột tham chiếu NULL, không có
 *    dòng journey / campaign_customers gắn vào dữ liệu của tenant kia; id của chính mình thì ghi như cũ.
 *  - B2: nhật ký thực thi chiến dịch map khách theo email CHỈ trong workspace của chiến dịch.
 */
import { describe, it, expect, beforeEach, beforeAll, jest } from '@jest/globals';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn();
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const emailSettingsSmtpService = (await import('../../src/services/email/emailSettingsSmtp.service.js')).default;
const campaignExecutionLogService = (await import('../../src/services/campaign/campaignExecutionLog.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');

const deps = {
  createSmtpTransporter: () => ({ sendMail: mockSendMail }),
  normalizeEmailList: (v) => (Array.isArray(v) ? v : (v ? [v] : [])),
  buildTrackedHtml: async (html) => html,
  buildMailAttachments: async () => [],
  formatUtc7: () => '2026-10-19 10:00:00',
};

beforeAll(() => {
  mockCreateTransport.mockReturnValue({ verify: jest.fn().mockResolvedValue(true), sendMail: mockSendMail });
});

beforeEach(async () => {
  await truncateAll();
  mockSendMail.mockReset().mockResolvedValue({ messageId: '<co-lap-dot2@uknow.test>', accepted: ['nguoinhan@example.com'] });
});

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function createTenant(label) {
  const user = await createUser({ username: `eb_${label}_${rnd()}`, email: `eb_${label}_${rnd()}@example.com` });
  const { rows: sender } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
     VALUES ($1, 'Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true) RETURNING id`,
    [user.id, `sender_${label}_${rnd()}@example.com`, encryptSmtpSecret('secret123')]
  );
  const { rows: customer } = await db.query(
    `INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, $3) RETURNING id`,
    [user.id, `khach_${label}_${rnd()}@example.com`, `Khach ${label}`]
  );
  const { rows: template } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html) VALUES ($1, $2, 'Chu de', '<p>Noi dung</p>') RETURNING id`,
    [user.id, `Mau ${label}`]
  );
  const { rows: campaign } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status, campaign_type) VALUES ($1, $2, 'active', 'email') RETURNING id`,
    [user.id, `Chien dich ${label}`]
  );
  const { rows: run } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, run_type) VALUES ($1, 'running', 'manual') RETURNING id`,
    [campaign[0].id]
  );
  return {
    user,
    senderId: Number(sender[0].id),
    customerId: Number(customer[0].id),
    customerEmail: (await db.query('SELECT email FROM customers WHERE id = $1', [customer[0].id])).rows[0].email,
    templateId: Number(template[0].id),
    campaignId: Number(campaign[0].id),
    runId: Number(run[0].id),
  };
}

function sendAs(tenant, extra) {
  return emailSettingsSmtpService.sendCustomEmail({
    userId: tenant.user.id,
    roleCode: 'user',
    ownerContextId: tenant.user.id,
    payload: {
      fromEmailId: tenant.senderId,
      to: 'nguoinhan@example.com',
      subject: 'Thu gui',
      content: 'Noi dung thu',
      saveMessageLog: true,
      ...extra,
    },
    trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'integration_test' },
  }, deps);
}

const lastMessage = async (ownerId) =>
  (await db.query(
    `SELECT id_campaign, id_run, id_customer, id_email_template, status, is_preview FROM email_messages
     WHERE workspace_owner_id = $1 ORDER BY id DESC LIMIT 1`,
    [ownerId]
  )).rows[0];

describe('B1 — gửi email thử/trực tiếp không gắn log vào khách / mẫu / lượt chạy / chiến dịch của tenant khác', () => {
  it('A gửi kèm id của B -> email gửi được; email_messages mọi cột tham chiếu NULL; không journey / campaign_customers của B', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');

    const result = await sendAs(a, {
      customerId: b.customerId,
      emailTemplateId: b.templateId,
      runId: b.runId,
      campaignId: b.campaignId,
    });

    expect(result.messageId).toBe('<co-lap-dot2@uknow.test>');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const row = await lastMessage(a.user.id);
    expect(row).toMatchObject({ id_campaign: null, id_run: null, id_customer: null, id_email_template: null });

    const journeyOfB = await db.query('SELECT 1 FROM customer_journey WHERE id_customer = $1 OR id_campaign = $2', [b.customerId, b.campaignId]);
    expect(journeyOfB.rows).toHaveLength(0);
    const participationOfB = await db.query('SELECT 1 FROM campaign_customers WHERE id_campaign = $1 OR id_customer = $2', [b.campaignId, b.customerId]);
    expect(participationOfB.rows).toHaveLength(0);
    const { rows: customerB } = await db.query('SELECT last_email_sent_at FROM customers WHERE id = $1', [b.customerId]);
    expect(customerB[0].last_email_sent_at).toBeNull();
    // Không có email_messages nào gắn vào dữ liệu của B.
    const messagesOfB = await db.query(
      'SELECT 1 FROM email_messages WHERE id_customer = $1 OR id_run = $2 OR id_campaign = $3 OR id_email_template = $4',
      [b.customerId, b.runId, b.campaignId, b.templateId]
    );
    expect(messagesOfB.rows).toHaveLength(0);
  });

  it('từng id riêng lẻ của B đều bị bỏ (customerId / emailTemplateId / runId)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');

    await sendAs(a, { customerId: b.customerId });
    expect((await lastMessage(a.user.id)).id_customer).toBeNull();

    await sendAs(a, { emailTemplateId: b.templateId });
    expect((await lastMessage(a.user.id)).id_email_template).toBeNull();

    await sendAs(a, { runId: b.runId });
    expect((await lastMessage(a.user.id)).id_run).toBeNull();
  });

  it('A gửi kèm id của CHÍNH A -> ghi như cũ (khách, mẫu, lượt chạy, chiến dịch)', async () => {
    const a = await createTenant('A');

    await sendAs(a, {
      customerId: a.customerId,
      emailTemplateId: a.templateId,
      runId: a.runId,
      campaignId: a.campaignId,
    });

    const row = await lastMessage(a.user.id);
    expect(Number(row.id_customer)).toBe(a.customerId);
    expect(Number(row.id_email_template)).toBe(a.templateId);
    expect(Number(row.id_run)).toBe(a.runId);
    expect(Number(row.id_campaign)).toBe(a.campaignId);
    const journey = await db.query('SELECT 1 FROM customer_journey WHERE id_customer = $1 AND id_campaign = $2', [a.customerId, a.campaignId]);
    expect(journey.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('SMTP hard bounce: dòng "bounced" cũng không mang id của tenant khác (nhánh ghi log riêng, không qua logEmailSentWithClient)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    mockSendMail.mockReset().mockRejectedValue(Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550 }));

    await expect(sendAs(a, {
      customerId: b.customerId,
      emailTemplateId: b.templateId,
      runId: b.runId,
      campaignId: b.campaignId,
    })).rejects.toMatchObject({ statusCode: 422 });

    const row = await lastMessage(a.user.id);
    expect(row).toMatchObject({ status: 'bounced', id_campaign: null, id_run: null, id_customer: null, id_email_template: null });
  });

  it('keepWorkspaceOwnedReferences: id rác / âm / không phải số -> null, không truy vấn', async () => {
    const a = await createTenant('A');
    const querySpy = jest.spyOn(db, 'query');
    try {
      const result = await emailSettingsSmtpService.keepWorkspaceOwnedReferences(a.user.id, {
        campaignId: 'abc', customerId: -5, emailTemplateId: 0, runId: 1e30,
      });
      expect(result).toEqual({ campaignId: null, customerId: null, emailTemplateId: null, runId: null });
      expect(querySpy).not.toHaveBeenCalled();
    } finally {
      querySpy.mockRestore();
    }
  });
});

describe('B2 — nhật ký thực thi chiến dịch map khách theo email chỉ trong workspace của chiến dịch', () => {
  const node = { id: 7, node_name: 'Gui email', node_type: 'action', node_subtype: 'send_email', execution_order: 1 };
  const execIdCustomer = async (runId) =>
    (await db.query('SELECT id_customer FROM campaign_executions WHERE id_run = $1', [runId])).rows[0]?.id_customer ?? null;

  it('chiến dịch của A gửi tới email trùng một khách của B (A không có khách đó) -> id_customer NULL, không trỏ khách B', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');

    await campaignExecutionLogService.logExecutionNode({
      campaignId: a.campaignId, runId: a.runId, node, recipientEmail: b.customerEmail,
    });

    expect(await execIdCustomer(a.runId)).toBeNull();
  });

  it('cả A và B đều có khách cùng email -> map sang khách của A (kể cả khi khách B có id nhỏ hơn)', async () => {
    const b = await createTenant('B');
    const a = await createTenant('A');
    const sharedEmail = `trung_${rnd()}@example.com`;
    const { rows: customerB } = await db.query('INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING id', [b.user.id, sharedEmail]);
    const { rows: customerA } = await db.query('INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING id', [a.user.id, sharedEmail]);
    expect(Number(customerB[0].id)).toBeLessThan(Number(customerA[0].id));

    await campaignExecutionLogService.logExecutionNode({
      campaignId: a.campaignId, runId: a.runId, node, recipientEmail: sharedEmail.toUpperCase(),
    });

    expect(Number(await execIdCustomer(a.runId))).toBe(Number(customerA[0].id));
  });

  it('id thô (không email) của khách tenant khác -> NULL; id thô của chính A -> giữ', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');

    await campaignExecutionLogService.logExecutionNode({ campaignId: a.campaignId, runId: a.runId, node, customerId: b.customerId });
    expect(await execIdCustomer(a.runId)).toBeNull();

    await db.query('DELETE FROM campaign_executions WHERE id_run = $1', [a.runId]);
    await campaignExecutionLogService.logExecutionNode({ campaignId: a.campaignId, runId: a.runId, node, customerId: a.customerId });
    expect(Number(await execIdCustomer(a.runId))).toBe(a.customerId);
  });

  it('email của chính khách A -> map đúng (luồng bình thường vẫn chạy)', async () => {
    const a = await createTenant('A');

    await campaignExecutionLogService.logExecutionNode({
      campaignId: a.campaignId, runId: a.runId, node, recipientEmail: a.customerEmail,
    });

    expect(Number(await execIdCustomer(a.runId))).toBe(a.customerId);
  });
});
