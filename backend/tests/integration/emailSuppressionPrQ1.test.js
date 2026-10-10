/**
 * PLAN_RA_SOAT_DOT3 mục B, PR-Q1 — lỗi gửi email ảnh hưởng production (DB thật).
 *
 * Việc 1: huỷ đăng ký / hard bounce chặn mọi nguồn người nhận (không chỉ bảng customers) qua email_suppressions;
 *         backfill của migration 295 idempotent.
 * Việc 3: thư lỗi ghi thẳng status 'failed' (không 'sent' rồi UPDATE).
 * Việc 5: DSN soft không đổi status; DSN hard không đè opened/clicked.
 * Việc 6: campaigns.total_opened / total_clicked chỉ tăng lần đầu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignEmailSenderService from '../../src/services/campaign/campaignEmailSender.service.js';
import bounceMailboxService from '../../src/services/email/bounceMailbox.service.js';
import emailSettingsSmtpService from '../../src/services/email/emailSettingsSmtp.service.js';
import campaignEmailSenderRepository from '../../src/repositories/campaign/campaignEmailSender.repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_295 = path.resolve(__dirname, '..', '..', 'migrations', '295_email_suppressions.sql');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const smtpErr = (message, responseCode, command) => Object.assign(new Error(message), { responseCode, command });

async function createOwnerWithSender(username) {
  const owner = await createUser({ username });
  await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, smtp_host, smtp_port, is_verified, status)
     VALUES ($1, 'Tester', 'sender@test.local', 'sender@test.local', 'smtp.test', 587, true, 'active')`,
    [owner.id]
  );
  // Chiến dịch + lượt chạy thật: email_messages.id_run có khoá ngoại tới campaign_runs.
  const campaign = (await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'Q1 suppression', 'email', 'active') RETURNING id, id_user, workspace_owner_id`,
    [owner.id]
  )).rows[0];
  const runId = (await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
     VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [campaign.id, owner.id]
  )).rows[0].id;
  return { ...owner, campaign, runId };
}

const actionNode = {
  id: 'node_send_email',
  data: { emailSubject: 'Tiêu đề thử', emailBody: '<p>Nội dung thử</p>', emailFromAddress: 'sender@example.com' },
};
// `owner` là kết quả createOwnerWithSender; emailStep khác nhau để các lần gửi lại không đụng khoá idempotency.
const sendTo = (owner, email, emailStep = 1) => campaignEmailSenderService.sendEmailToCustomerDirect(
  actionNode,
  { email, full_name: 'Người nhận' },
  owner.campaign,
  owner.runId,
  null,
  { emailStep }
);

const suppressionRows = async () => (await db.query(
  'SELECT workspace_owner_id, email_lower, reason, source FROM email_suppressions ORDER BY id'
)).rows;

async function insertMessage({ token, ownerId, email, status = 'sent', isPreview = false, customerId = null, campaignId = null }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (tracking_token, workspace_owner_id, recipient_email, status, is_preview, id_customer, id_campaign, open_count, click_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0) RETURNING id`,
    [token, ownerId, email, status, isPreview, customerId, campaignId]
  );
  return rows[0].id;
}

// ─────────────────────────────────────────────────────────────────────────
describe('Việc 1 — huỷ đăng ký chặn người nhận KHÔNG có trong bảng customers (nguồn Sheet/lead/form)', () => {
  it('gửi -> bấm link huỷ -> gửi lại: lần 2 skipped/unsubscribed, SMTP không bị gọi, không thêm dòng email_messages', async () => {
    const owner = await createOwnerWithSender('supp_owner_1');
    const smtp = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'm-1' } });

    const first = await sendTo(owner, 'Sheet.Khach@Test.local');
    expect(first.status).toBe('success');
    expect((await db.query('SELECT COUNT(*)::int AS c FROM customers WHERE id_user = $1', [owner.id])).rows[0].c).toBe(0);

    const { rows: msgRows } = await db.query(
      `SELECT tracking_token FROM email_messages WHERE recipient_email = 'Sheet.Khach@Test.local'`
    );
    expect(msgRows).toHaveLength(1);

    const res = await request(app).get(`/api/customers/email-tracking/unsubscribe/${msgRows[0].tracking_token}`);
    expect(res.status).toBe(200);
    expect(await suppressionRows()).toEqual([
      { workspace_owner_id: String(owner.id), email_lower: 'sheet.khach@test.local', reason: 'unsubscribe', source: 'unsubscribe_link' },
    ]);

    const second = await sendTo(owner, 'sheet.khach@test.local', 2);
    expect(second).toEqual({ to: 'sheet.khach@test.local', status: 'skipped', reason: 'unsubscribed' });
    expect(smtp).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT COUNT(*)::int AS c FROM email_messages')).rows[0].c).toBe(1);
  });

  it('huỷ đăng ký ở workspace A KHÔNG chặn workspace B gửi cùng địa chỉ', async () => {
    const ownerA = await createOwnerWithSender('supp_owner_a');
    const ownerB = await createOwnerWithSender('supp_owner_b');
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'm-2' } });

    await sendTo(ownerA, 'chung@test.local');
    const { rows } = await db.query(`SELECT tracking_token FROM email_messages WHERE recipient_email = 'chung@test.local'`);
    await request(app).get(`/api/customers/email-tracking/unsubscribe/${rows[0].tracking_token}`);

    expect((await sendTo(ownerA, 'chung@test.local', 2)).status).toBe('skipped');
    expect((await sendTo(ownerB, 'chung@test.local')).status).toBe('success');
  });

  it('hard bounce SMTP (550 user unknown): ghi suppression hard_bounce, lần sau skipped/hard_bounced', async () => {
    const owner = await createOwnerWithSender('supp_owner_hb');
    const smtp = jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('550 5.1.1 <ghost@test.local> User unknown; no such user here', 550, 'RCPT TO'));

    const first = await sendTo(owner, 'ghost@test.local');
    expect(first.status).toBe('bounced');
    expect(first.bounceType).toBe('hard');
    expect((await suppressionRows()).map((r) => [r.email_lower, r.reason, r.source])).toEqual([
      ['ghost@test.local', 'hard_bounce', 'smtp_hard_bounce'],
    ]);
    const { rows } = await db.query(`SELECT status, bounce_type FROM email_messages WHERE recipient_email = 'ghost@test.local'`);
    expect(rows).toEqual([{ status: 'bounced', bounce_type: 'hard' }]);

    const second = await sendTo(owner, 'ghost@test.local', 2);
    expect(second).toEqual({ to: 'ghost@test.local', status: 'skipped', reason: 'hard_bounced' });
    expect(smtp).toHaveBeenCalledTimes(1);
  });

  it('DSN hard bounce cho người nhận không có trong customers -> ghi suppression; tin gửi thử (is_preview) thì KHÔNG', async () => {
    const owner = await createOwnerWithSender('supp_owner_dsn');
    await insertMessage({ token: 'dsn-hard-real', ownerId: owner.id, email: 'Real.Ghost@Test.local' });
    await insertMessage({ token: 'dsn-hard-preview', ownerId: owner.id, email: 'preview@test.local', isPreview: true });

    const dsn = (token) => `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery Failure

Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown
`;
    expect((await bounceMailboxService.processDsnMessage(dsn('dsn-hard-real'))).status).toBe('bounced');
    expect((await bounceMailboxService.processDsnMessage(dsn('dsn-hard-preview'))).status).toBe('bounced');

    expect((await suppressionRows()).map((r) => [r.email_lower, r.reason, r.source])).toEqual([
      ['real.ghost@test.local', 'hard_bounce', 'dsn_hard_bounce'],
    ]);
  });

  it('hard bounce nâng cấp dòng unsubscribe thành hard_bounce; unsubscribe không hạ hard_bounce', async () => {
    const owner = await createOwnerWithSender('supp_owner_upgrade');
    await insertMessage({ token: 'up-1', ownerId: owner.id, email: 'up@test.local' });
    await db.query(
      `INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source) VALUES ($1, 'up@test.local', 'unsubscribe', 'x')`,
      [owner.id]
    );
    const dsn = `From: mailer-daemon@digiso.vn
To: bounce+up-1@digiso.vn
Subject: Delivery Failure

Action: failed
Status: 5.1.1
`;
    await bounceMailboxService.processDsnMessage(dsn);
    expect((await suppressionRows())[0].reason).toBe('hard_bounce');

    await request(app).get('/api/customers/email-tracking/unsubscribe/up-1');
    expect((await suppressionRows())[0].reason).toBe('hard_bounce');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Việc 1 — backfill của migration 295 (idempotent)', () => {
  it('nạp đúng nguồn, bỏ soft bounce / tin thử / thư thường, chạy lại không thêm dòng và không đè dòng có sẵn', async () => {
    const owner = await createUser({ username: 'supp_owner_backfill' });
    const mkCustomer = async (email, { subscribed = true, hard = false } = {}) => (await db.query(
      `INSERT INTO customers (id_user, email, email_subscribed, email_hard_bounced) VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner.id, email, subscribed, hard]
    )).rows[0].id;
    await mkCustomer('cust-unsub@test.local', { subscribed: false });
    await mkCustomer('cust-hard@test.local', { hard: true });
    await mkCustomer('cust-both@test.local', { subscribed: false, hard: true });
    await mkCustomer('cust-ok@test.local');

    await insertMessage({ token: 'bf-unsub', ownerId: owner.id, email: 'Msg-Unsub@Test.local', status: 'unsubscribed' });
    await insertMessage({ token: 'bf-hard', ownerId: owner.id, email: 'msg-hard@test.local', status: 'bounced' });
    await db.query(`UPDATE email_messages SET bounce_type = 'hard' WHERE tracking_token = 'bf-hard'`);
    await insertMessage({ token: 'bf-soft', ownerId: owner.id, email: 'msg-soft@test.local', status: 'bounced' });
    await db.query(`UPDATE email_messages SET bounce_type = 'soft' WHERE tracking_token = 'bf-soft'`);
    await insertMessage({ token: 'bf-prev', ownerId: owner.id, email: 'msg-prev@test.local', status: 'bounced', isPreview: true });
    await db.query(`UPDATE email_messages SET bounce_type = 'hard' WHERE tracking_token = 'bf-prev'`);
    await insertMessage({ token: 'bf-sent', ownerId: owner.id, email: 'msg-sent@test.local', status: 'sent' });
    // Dòng có sẵn: backfill không được đè.
    await db.query(
      `INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source) VALUES ($1, 'cust-unsub@test.local', 'unsubscribe', 'giu-nguyen')`,
      [owner.id]
    );

    const sql = fs.readFileSync(MIGRATION_295, 'utf8');
    await db.query(sql);
    const snapshot = async () => (await suppressionRows()).map((r) => `${r.email_lower}|${r.reason}|${r.source}`).sort();

    const expected = [
      'cust-both@test.local|hard_bounce|backfill_customer',
      'cust-hard@test.local|hard_bounce|backfill_customer',
      'cust-unsub@test.local|unsubscribe|giu-nguyen',
      'msg-hard@test.local|hard_bounce|backfill_message',
      'msg-unsub@test.local|unsubscribe|backfill_message',
    ].sort();
    expect(await snapshot()).toEqual(expected);

    await db.query(sql);
    expect(await snapshot()).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Việc 3 — thư lỗi ghi thẳng status cuối', () => {
  it('SMTP từ chối nội dung (554) -> dòng email_messages có status=failed NGAY LÚC INSERT (UPDATE đuôi bị chặn vẫn failed)', async () => {
    const owner = await createOwnerWithSender('supp_owner_failed');
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('554 5.7.1 Message rejected due to content policy', 554, 'DATA'));
    // Chặn UPDATE đuôi: nếu status vẫn 'failed' thì nó đến từ INSERT, không phải từ UPDATE.
    const tailUpdate = jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageFailed').mockResolvedValue();

    const result = await sendTo(owner, 'rejected@test.local');

    expect(result.errorType).toBe('smtp_delivery');
    expect(tailUpdate).toHaveBeenCalledTimes(1);
    const { rows } = await db.query(`SELECT status FROM email_messages WHERE recipient_email = 'rejected@test.local'`);
    expect(rows).toEqual([{ status: 'failed' }]);
  });

  it.each(['failed', 'bounced'])('logEmailSent({ status: %s }) ghi đúng status đó, không phải "sent"', async (status) => {
    const owner = await createOwnerWithSender(`supp_owner_status_${status}`);
    await emailSettingsSmtpService.logEmailSent({
      userId: owner.id,
      workspaceOwnerId: owner.id,
      actorUserId: owner.id,
      campaignId: owner.campaign.id,
      customerId: null,
      emailTemplateId: null,
      fromEmailId: null,
      to: `status-${status}@test.local`,
      subject: 'S',
      trackedHtmlContent: null,
      plainTextContent: 'x',
      trackingToken: `status-${status}`,
      info: { messageId: null },
      sentAt: new Date(),
      setting: { email: 'sender@test.local' },
      runId: owner.runId,
      deliveryFailed: true,
      status,
    });
    const { rows } = await db.query('SELECT status FROM email_messages WHERE tracking_token = $1', [`status-${status}`]);
    expect(rows).toEqual([{ status }]);
  });

  it('ĐỐI CHỨNG: không truyền status -> "sent"', async () => {
    const owner = await createOwnerWithSender('supp_owner_status_default');
    await emailSettingsSmtpService.logEmailSent({
      userId: owner.id,
      workspaceOwnerId: owner.id,
      actorUserId: owner.id,
      campaignId: owner.campaign.id,
      customerId: null,
      emailTemplateId: null,
      fromEmailId: null,
      to: 'status-default@test.local',
      subject: 'S',
      trackedHtmlContent: null,
      plainTextContent: 'x',
      trackingToken: 'status-default',
      info: { messageId: 'm' },
      sentAt: new Date(),
      setting: { email: 'sender@test.local' },
      runId: owner.runId,
    });
    const { rows } = await db.query(`SELECT status FROM email_messages WHERE tracking_token = 'status-default'`);
    expect(rows).toEqual([{ status: 'sent' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Việc 5 — DSN: soft không đổi status, hard không đè opened/clicked', () => {
  const dsnText = (token, status, action) => `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery notification

Action: ${action}
Status: ${status}
Diagnostic-Code: smtp; ${status} test
`;

  it('DSN soft (4.2.2 / delayed): status giữ nguyên, chỉ ghi bounce_type=soft, bounced_at vẫn rỗng, KHÔNG suppression', async () => {
    const owner = await createOwnerWithSender('supp_owner_soft');
    await insertMessage({ token: 'soft-1', ownerId: owner.id, email: 'soft@test.local' });

    const res = await bounceMailboxService.processDsnMessage(dsnText('soft-1', '4.2.2', 'delayed'));

    expect(res.bounceType).toBe('soft');
    const { rows } = await db.query(`SELECT status, bounce_type, bounce_code, bounced_at FROM email_messages WHERE tracking_token = 'soft-1'`);
    expect(rows[0]).toMatchObject({ status: 'sent', bounce_type: 'soft', bounce_code: '4.2.2', bounced_at: null });
    expect(await suppressionRows()).toEqual([]);
  });

  it.each(['opened', 'clicked'])('DSN hard tới sau khi thư đã %s: status giữ nguyên nhưng bounce_type=hard vẫn được ghi', async (status) => {
    const owner = await createOwnerWithSender(`supp_owner_keep_${status}`);
    await insertMessage({ token: `keep-${status}`, ownerId: owner.id, email: `keep-${status}@test.local`, status });

    await bounceMailboxService.processDsnMessage(dsnText(`keep-${status}`, '5.1.1', 'failed'));

    const { rows } = await db.query(`SELECT status, bounce_type, bounced_at FROM email_messages WHERE tracking_token = $1`, [`keep-${status}`]);
    expect(rows[0].status).toBe(status);
    expect(rows[0].bounce_type).toBe('hard');
    expect(rows[0].bounced_at).not.toBeNull();
  });

  it('ĐỐI CHỨNG: DSN hard trên thư status=sent -> bounced', async () => {
    const owner = await createOwnerWithSender('supp_owner_hard_sent');
    await insertMessage({ token: 'hard-sent', ownerId: owner.id, email: 'hs@test.local' });
    await bounceMailboxService.processDsnMessage(dsnText('hard-sent', '5.1.1', 'failed'));
    const { rows } = await db.query(`SELECT status FROM email_messages WHERE tracking_token = 'hard-sent'`);
    expect(rows[0].status).toBe('bounced');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Việc 6 — campaigns.total_opened / total_clicked chỉ tăng lần đầu', () => {
  async function fixture(token) {
    const owner = await createUser({ username: `cnt_${token}` });
    const customer = (await db.query(`INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING id`, [owner.id, `${token}@test.local`])).rows[0];
    const campaign = (await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status, total_opened, total_clicked) VALUES ($1, 'C', 'running', 0, 0) RETURNING id`,
      [owner.id]
    )).rows[0];
    await insertMessage({ token, ownerId: owner.id, email: `${token}@test.local`, customerId: customer.id, campaignId: campaign.id });
    return campaign.id;
  }
  const totals = async (campaignId) => (await db.query('SELECT total_opened, total_clicked FROM campaigns WHERE id = $1', [campaignId])).rows[0];

  it('pixel tải 3 lần (proxy ảnh) -> total_opened = 1, open_count = 3', async () => {
    const campaignId = await fixture('cnt-open');
    for (let i = 0; i < 3; i += 1) await request(app).get('/api/customers/email-tracking/open/cnt-open');
    expect((await totals(campaignId)).total_opened).toBe(1);
    expect((await db.query(`SELECT open_count FROM email_messages WHERE tracking_token = 'cnt-open'`)).rows[0].open_count).toBe(3);
  });

  it('bấm 3 lần -> total_clicked = 1, click_count = 3', async () => {
    const campaignId = await fixture('cnt-click');
    const url = encodeURIComponent('https://example.com/x');
    for (let i = 0; i < 3; i += 1) await request(app).get(`/api/customers/email-tracking/click/cnt-click?url=${url}`);
    expect((await totals(campaignId)).total_clicked).toBe(1);
    expect((await db.query(`SELECT click_count FROM email_messages WHERE tracking_token = 'cnt-click'`)).rows[0].click_count).toBe(3);
  });

  it('bấm trước (mở suy ra từ click) rồi pixel tới sau -> total_opened = 1, không đếm đôi và không mất', async () => {
    const campaignId = await fixture('cnt-infer');
    await request(app).get(`/api/customers/email-tracking/click/cnt-infer?url=${encodeURIComponent('https://example.com/x')}`);
    expect((await totals(campaignId)).total_opened).toBe(1);
    await request(app).get('/api/customers/email-tracking/open/cnt-infer');
    expect((await totals(campaignId)).total_opened).toBe(1);
  });
});
