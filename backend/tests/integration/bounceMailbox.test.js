import { jest } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import { resolveEnvelopeFrom } from '../../src/utils/emailFromAddress.util.js';
import bounceMailboxService from '../../src/services/email/bounceMailbox.service.js';

describe('Async Bounce Mailbox (VERP + IMAP DSN) — Plan 173', () => {
  let ownerUser;
  let testCustomer;
  let testCampaign;
  let testEmailSetting;

  beforeAll(async () => {
    await dbHelpers.truncateAll();

    ownerUser = await dbHelpers.createUser({ username: `bounce_tester_${Date.now()}` });
    const plan = await dbHelpers.createPlan({
      monthlyEmailLimit: 1000,
      monthlyZaloLimit: 1000,
    });
    await dbHelpers.assignPlanToUser(ownerUser.id, plan.id);

    const campRes = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, total_sent, total_customers)
       VALUES ($1, 'Test Bounce Campaign', 'email', 'draft', 0, 0)
       RETURNING id, campaign_name`,
      [ownerUser.id]
    );
    testCampaign = campRes.rows[0];

    const custRes = await db.query(
      `INSERT INTO customers (id_user, email, full_name, email_hard_bounced)
       VALUES ($1, 'bounced_user@test.local', 'Test Bounced User', FALSE)
       RETURNING id, email, email_hard_bounced`,
      [ownerUser.id]
    );
    testCustomer = custRes.rows[0];

    const settingRes = await db.query(
      `INSERT INTO email_settings (id_user, name, email, reply_to, email_mode, smtp_host, smtp_port, is_verified, status)
       VALUES ($1, 'Platform Sender', 'no-reply@digiso.vn', 'contact@digiso.vn', 'platform', 'mail.digiso.vn', 465, TRUE, 'active')
       RETURNING id, email, email_mode`,
      [ownerUser.id]
    );
    testEmailSetting = settingRes.rows[0];
  });

  afterAll(async () => {
    if (ownerUser?.id) {
      await db.query(`DELETE FROM users WHERE id = $1`, [ownerUser.id]).catch(() => {});
    }
  });

  describe('1. resolveEnvelopeFrom (VERP formatting & safety)', () => {
    const originalEnv = process.env.BOUNCE_DOMAIN;

    afterEach(() => {
      process.env.BOUNCE_DOMAIN = originalEnv;
    });

    it('gắn đúng envelope format bounce+<token>@<domain> cho email_mode = platform', () => {
      process.env.BOUNCE_DOMAIN = 'digiso.vn';
      const token = 'abc-123-xyz';
      const envelope = resolveEnvelopeFrom({ email_mode: 'platform' }, token);
      expect(envelope).toBe('bounce+abc-123-xyz@digiso.vn');
    });

    it('trả về null khi email_mode = smtp (người dùng mang SMTP riêng)', () => {
      process.env.BOUNCE_DOMAIN = 'digiso.vn';
      const token = 'abc-123-xyz';
      const envelope = resolveEnvelopeFrom({ email_mode: 'smtp' }, token);
      expect(envelope).toBeNull();
    });

    it('trả về null khi BOUNCE_DOMAIN chưa cấu hình hoặc rỗng', () => {
      delete process.env.BOUNCE_DOMAIN;
      const token = 'abc-123-xyz';
      const envelope = resolveEnvelopeFrom({ email_mode: 'platform' }, token);
      expect(envelope).toBeNull();
    });

    it('từ chối tracking token chứa ký tự đặc biệt nguy hiểm (chống SMTP injection)', () => {
      process.env.BOUNCE_DOMAIN = 'digiso.vn';
      const invalidToken = 'abc\r\nRCPT TO:victim@evil.com';
      const envelope = resolveEnvelopeFrom({ email_mode: 'platform' }, invalidToken);
      expect(envelope).toBeNull();
    });
  });

  describe('2. parseDsnMessage (RFC 3464 Parsing)', () => {
    it('bóc đúng DSN 5.1.1 Hard bounce từ message/delivery-status', async () => {
      const rawDsn = `From: Mail Delivery System <mailer-daemon@googlemail.com>
To: bounce+token-hard-123@digiso.vn
Subject: Mail delivery failed: returning message to sender
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="BOUNDARY123"

--BOUNDARY123
Content-Type: text/plain; charset=utf-8

This is the mail system at host mail.digiso.vn.
Your message to invalid-user@gmail.com cannot be delivered.

--BOUNDARY123
Content-Type: message/delivery-status

Reporting-MTA: dns; mail.digiso.vn
Final-Recipient: rfc822; invalid-user@gmail.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.

--BOUNDARY123--`;

      const result = await bounceMailboxService.parseDsnMessage(rawDsn);
      expect(result.trackingToken).toBe('token-hard-123');
      expect(result.isDsn).toBe(true);
      expect(result.bounceType).toBe('hard');
      expect(result.bounceCode).toBe('5.1.1');
      expect(result.bounceReason).toContain('550-5.1.1 The email account that you tried to reach does not exist');
    });

    it('bóc đúng DSN 4.2.2 Soft bounce (mailbox full)', async () => {
      const rawDsn = `From: Mail Delivery System <mailer-daemon@recipient-server.com>
To: bounce+token-soft-456@digiso.vn
Subject: Delivery Status Notification (Delay)
Content-Type: text/plain

Final-Recipient: rfc822; full-box@example.com
Action: delayed
Status: 4.2.2
Diagnostic-Code: smtp; 452 4.2.2 Mailbox is full / quota exceeded
`;

      const result = await bounceMailboxService.parseDsnMessage(rawDsn);
      expect(result.trackingToken).toBe('token-soft-456');
      expect(result.isDsn).toBe(true);
      expect(result.bounceType).toBe('soft');
      expect(result.bounceCode).toBe('4.2.2');
      expect(result.bounceReason).toContain('Mailbox is full');
    });

    it('nhận diện thông báo giao thành công Status: 2.0.0 là isDsn=false', async () => {
      const rawSuccessDsn = `From: Mail Delivery System <mailer-daemon@example.com>
To: bounce+token-success-789@digiso.vn
Subject: Successful Mail Delivery Report

Action: delivered
Status: 2.0.0
Diagnostic-Code: smtp; 250 2.0.0 OK delivered to recipient
`;

      const result = await bounceMailboxService.parseDsnMessage(rawSuccessDsn);
      expect(result.trackingToken).toBe('token-success-789');
      expect(result.isDsn).toBe(false);
      expect(result.bounceReason).toBe('Delivery success DSN');
    });

    it('bỏ qua an toàn các thư auto-reply / out of office không chứa DSN failure', async () => {
      const rawAutoReply = `From: boss@company.com
To: bounce+token-autoreply@digiso.vn
Subject: Out of Office: Re: Monthly Newsletter
Auto-Submitted: auto-replied

I am currently out of the office returning next Monday.
`;

      const result = await bounceMailboxService.parseDsnMessage(rawAutoReply);
      expect(result.isDsn).toBe(false);
      expect(result.bounceReason).toBe('Auto-reply (out of office)');
    });

    it('thư người thật trả lời có trích địa chỉ bounce+token@ thì isDsn=false', async () => {
      const rawHumanReply = `From: real-user@gmail.com
To: contact@digiso.vn
Subject: Re: Chào bạn

Cảm ơn bạn đã gửi email. Tôi muốn hỏi thêm chi tiết về khoá học.
> On Mon, bounce+token-human-999@digiso.vn wrote:
> Chào bạn, đây là thông tin khoá học...
`;

      const result = await bounceMailboxService.parseDsnMessage(rawHumanReply);
      expect(result.trackingToken).toBe('token-human-999');
      expect(result.isDsn).toBe(false);
    });
  });

  describe('3. processDsnMessage (Database Recording & Hard Bounce Marking)', () => {
    it('ghi nhận Hard bounce vào email_messages và đánh dấu customers.email_hard_bounced = true', async () => {
      const token = `hard_token_${Date.now()}`;

      // Insert sent message record
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawDsn = `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery Failure

Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown
`;

      const res = await bounceMailboxService.processDsnMessage(rawDsn);
      expect(res.status).toBe('bounced');
      expect(res.bounceType).toBe('hard');
      expect(res.bounceCode).toBe('5.1.1');

      // Check email_messages row
      const { rows: msgRows } = await db.query(
        `SELECT status, bounce_type, bounce_code, bounce_detected_via, bounced_at, bounce_reason
         FROM email_messages WHERE tracking_token = $1`,
        [token]
      );
      expect(msgRows.length).toBe(1);
      expect(msgRows[0].status).toBe('bounced');
      expect(msgRows[0].bounce_type).toBe('hard');
      expect(msgRows[0].bounce_code).toBe('5.1.1');
      expect(msgRows[0].bounce_detected_via).toBe('dsn');
      expect(msgRows[0].bounced_at).toBeTruthy();
      expect(msgRows[0].bounce_reason).toContain('User unknown');

      // Check customer row: email_hard_bounced MUST BE true
      const { rows: custRows } = await db.query(
        `SELECT email_hard_bounced FROM customers WHERE id = $1`,
        [testCustomer.id]
      );
      expect(custRows[0].email_hard_bounced).toBe(true);
    });

    it('ghi nhận Soft bounce vào email_messages nhưng KHÔNG đánh dấu customers.email_hard_bounced', async () => {
      // Reset customer hard bounced flag
      await db.query(`UPDATE customers SET email_hard_bounced = FALSE WHERE id = $1`, [testCustomer.id]);

      const token = `soft_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawDsn = `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery delayed

Action: delayed
Status: 4.2.1
Diagnostic-Code: smtp; 451 4.2.1 Service temporarily unavailable
`;

      const res = await bounceMailboxService.processDsnMessage(rawDsn);
      expect(res.status).toBe('bounced');
      expect(res.bounceType).toBe('soft');
      expect(res.bounceCode).toBe('4.2.1');

      // Check customer row: email_hard_bounced MUST REMAIN false
      const { rows: custRows } = await db.query(
        `SELECT email_hard_bounced FROM customers WHERE id = $1`,
        [testCustomer.id]
      );
      expect(custRows[0].email_hard_bounced).toBe(false);
    });

    it('bỏ qua an toàn DSN báo giao thành công (Status: 2.0.0) — không ghi bounce, không mark customer', async () => {
      await db.query(`UPDATE customers SET email_hard_bounced = FALSE WHERE id = $1`, [testCustomer.id]);

      const token = `success_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawSuccess = `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery Status Notification (Success)

Action: delivered
Status: 2.0.0
`;

      const res = await bounceMailboxService.processDsnMessage(rawSuccess);
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('not_a_dsn');

      // Check email_messages row: status remains 'sent'
      const { rows: msgRows } = await db.query(
        `SELECT status, bounce_type FROM email_messages WHERE tracking_token = $1`,
        [token]
      );
      expect(msgRows[0].status).toBe('sent');
      expect(msgRows[0].bounce_type).toBeNull();

      // Customer remains NOT hard bounced
      const { rows: custRows } = await db.query(
        `SELECT email_hard_bounced FROM customers WHERE id = $1`,
        [testCustomer.id]
      );
      expect(custRows[0].email_hard_bounced).toBe(false);
    });

    it('bỏ qua an toàn thư trả lời từ người thật có trích token — không ghi bounce', async () => {
      await db.query(`UPDATE customers SET email_hard_bounced = FALSE WHERE id = $1`, [testCustomer.id]);

      const token = `human_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawHuman = `From: real-person@gmail.com
To: contact@digiso.vn
Subject: Re: Báo giá

Tôi nhận được email rồi nhé.
> On Tue, bounce+${token}@digiso.vn wrote:
> Chào anh...
`;

      const res = await bounceMailboxService.processDsnMessage(rawHuman);
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('not_a_dsn');

      const { rows: msgRows } = await db.query(
        `SELECT status FROM email_messages WHERE tracking_token = $1`,
        [token]
      );
      expect(msgRows[0].status).toBe('sent');
    });

    it('bỏ qua an toàn thư auto-reply out of office — không ghi bounce', async () => {
      const token = `autoreply_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawAuto = `From: recipient@example.com
To: bounce+${token}@digiso.vn
Subject: Out of Office
Auto-Submitted: auto-replied

I am out of office until Monday.
`;

      const res = await bounceMailboxService.processDsnMessage(rawAuto);
      expect(res.status).toBe('skipped');
      expect(res.reason).toBe('not_a_dsn');

      const { rows: msgRows } = await db.query(
        `SELECT status FROM email_messages WHERE tracking_token = $1`,
        [token]
      );
      expect(msgRows[0].status).toBe('sent');
    });

    it('ghi nhận bounce cho tin preview (is_preview = true) nhưng KHÔNG đánh dấu customers.email_hard_bounced', async () => {
      await db.query(`UPDATE customers SET email_hard_bounced = FALSE WHERE id = $1`, [testCustomer.id]);

      const previewToken = `preview_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', TRUE)`,
        [testCampaign.id, testCustomer.id, previewToken, testCustomer.email]
      );

      const rawDsn = `From: mailer-daemon@digiso.vn
To: bounce+${previewToken}@digiso.vn
Subject: Delivery Failure

Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown
`;

      const res = await bounceMailboxService.processDsnMessage(rawDsn);
      expect(res.status).toBe('bounced');
      expect(res.isPreview).toBe(true);

      // Check customer row: email_hard_bounced MUST REMAIN false
      const { rows: custRows } = await db.query(
        `SELECT email_hard_bounced FROM customers WHERE id = $1`,
        [testCustomer.id]
      );
      expect(custRows[0].email_hard_bounced).toBe(false);
    });

    it('xử lý lặp lại (idempotent): cùng 1 DSN xử lý nhiều lần không gây lỗi hoặc sai lệch dữ liệu', async () => {
      const token = `idempotent_token_${Date.now()}`;
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, id_customer, tracking_token, recipient_email, status, is_preview
         ) VALUES ($1, $2, $3, $4, 'sent', FALSE)`,
        [testCampaign.id, testCustomer.id, token, testCustomer.email]
      );

      const rawDsn = `From: mailer-daemon@digiso.vn
To: bounce+${token}@digiso.vn
Subject: Delivery Failure

Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown
`;

      const res1 = await bounceMailboxService.processDsnMessage(rawDsn);
      const res2 = await bounceMailboxService.processDsnMessage(rawDsn);

      expect(res1.status).toBe('bounced');
      expect(res2.status).toBe('bounced');

      const { rows: countRows } = await db.query(
        `SELECT COUNT(*)::int AS count FROM email_messages WHERE tracking_token = $1`,
        [token]
      );
      expect(countRows[0].count).toBe(1);
    });
  });

  describe('4. syncBounceMailbox graceful skip', () => {
    it('bỏ qua đồng bộ an toàn khi chưa cấu hình đầy đủ biến môi trường IMAP', async () => {
      const originalHost = process.env.BOUNCE_IMAP_HOST;
      delete process.env.BOUNCE_IMAP_HOST;

      const res = await bounceMailboxService.syncBounceMailbox();
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('missing_bounce_imap_config');

      process.env.BOUNCE_IMAP_HOST = originalHost;
    });
  });
});
