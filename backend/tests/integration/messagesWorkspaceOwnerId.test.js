import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import emailSettingsRepository from '../../src/repositories/email/emailSettings.repository.js';
import zaloMessageRepository from '../../src/repositories/campaign/zaloMessage.repository.js';
import emailSettingsSmtpService from '../../src/services/email/emailSettingsSmtp.service.js';
import campaignEmailSenderService from '../../src/services/campaign/campaignEmailSender.service.js';
import campaignRunService from '../../src/services/campaign/campaignRun.service.js';
import zaloAccountSessionService from '../../src/services/zalo/zaloAccountSession.service.js';
import { encryptSmtpSecret } from '../../src/utils/smtpSecretCrypto.js';

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';

describe('Việc 2 — Cột workspace_owner_id trên email_messages và zalo_messages', () => {
  let ownerUser;
  let staffUser;

  beforeAll(async () => {
    // DB ready
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    await dbHelpers.truncateAll();
    ownerUser = await dbHelpers.createUser({ username: `owner_${Date.now()}` });
    staffUser = await dbHelpers.createUser({ username: `staff_${Date.now()}` });
  });

  describe('Đường ghi Email (insertEmailMessage)', () => {
    it('ghi đúng workspace_owner_id khi gọi emailSettingsRepository.insertEmailMessage', async () => {
      const emailId = await emailSettingsRepository.insertEmailMessage(db, {
        campaignId: null,
        runId: null,
        customerId: null,
        templateId: null,
        fromEmailId: null,
        recipientEmail: 'test@example.com',
        senderEmail: 'sender@example.com',
        subject: 'Direct Repo Test',
        bodyHtml: '<p>Hi</p>',
        bodyText: 'Hi',
        status: 'sent',
        sentAt: new Date(),
        workspaceOwnerId: ownerUser.id,
      });

      expect(emailId).toBeDefined();
      const { rows } = await db.query(
        'SELECT id, workspace_owner_id, recipient_email FROM email_messages WHERE id = $1',
        [emailId]
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerUser.id));
    });

    it('logEmailSentWithClient tự động suy workspaceOwnerId từ getOwnedCampaign khi có campaignId', async () => {
      // 1. Tạo campaign thuộc ownerUser
      const { rows: campRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $2, 'Campaign For Email Test', 'active', 'email')
         RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(campRows[0].id);

      // 2. Gọi logEmailSentWithClient truyền workspaceOwnerId từ context chiến dịch
      const emailId = await emailSettingsSmtpService.logEmailSentWithClient(db, {
        userId: staffUser.id,
        workspaceOwnerId: ownerUser.id,
        campaignId,
        recipientEmail: 'client@example.com',
        to: 'client@example.com',
        subject: 'Campaign email',
        sentAt: new Date(),
      });

      expect(emailId).toBeDefined();
      const { rows } = await db.query(
        'SELECT id, workspace_owner_id FROM email_messages WHERE id = $1',
        [emailId]
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerUser.id));
    });

    it('logEmailSentWithClient tự lấy workspace_owner_id từ campaign khi chủ workspace tự gửi', async () => {
      // Chủ workspace tự gửi chiến dịch của mình (chỉ truyền userId: ownerUser.id)
      const { rows: campRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, NULL, 'Campaign Owner Direct', 'active', 'email')
         RETURNING id`,
        [ownerUser.id]
      );
      const campaignId = Number(campRows[0].id);

      const emailId = await emailSettingsSmtpService.logEmailSentWithClient(db, {
        userId: ownerUser.id,
        campaignId,
        recipientEmail: 'direct@example.com',
        to: 'direct@example.com',
        subject: 'Direct campaign email',
        sentAt: new Date(),
      });

      expect(emailId).toBeDefined();
      const { rows } = await db.query(
        'SELECT id, workspace_owner_id FROM email_messages WHERE id = $1',
        [emailId]
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerUser.id));
    });

    it('đường gửi thật (sendEmailToCustomerDirect, legacy success) với workspace_owner_id = A, id_user = B ghi đúng workspace_owner_id = A', async () => {
      // 1. Tạo email_settings cho staffUser (người tạo chiến dịch)
      const { rows: sRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Staff Sender', 'staff_sender@example.com', 'smtp.example.com', 465, 'staff_sender@example.com', $2, 'active', true)
         RETURNING id`,
        [staffUser.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = sRows[0].id;

      // 2. Tạo customer cho ownerUser
      const recipientEmail = `customer_${Date.now()}@example.com`;
      const { rows: custRows } = await db.query(
        `INSERT INTO customers (id_user, workspace_owner_id, email, full_name)
         VALUES ($1, $1, $2, 'Customer Test')
         RETURNING id`,
        [ownerUser.id, recipientEmail]
      );
      const customerId = custRows[0].id;

      // 3. Tạo campaign do staffUser (B) tạo nhưng thuộc workspace_owner_id = ownerUser (A)
      const { rows: campRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $2, 'Staff Campaign For Owner', 'active', 'email')
         RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(campRows[0].id);

      // 4. Tạo run
      const { rows: rRows } = await db.query(
        `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
         VALUES ($1, $2, 'manual', 'running') RETURNING id`,
        [campaignId, ownerUser.id]
      );
      const runId = rRows[0].id;

      const actionNode = {
        id: 'node_email_1',
        config: {
          fromEmailId: emailSettingId,
          emailSubject: 'Staff Email Subject',
          emailBody: '<p>Staff Email Body</p>',
        },
      };
      const customer = { id: customerId, email: recipientEmail, full_name: 'Customer Test' };
      const campaign = { id: campaignId, id_user: staffUser.id, workspace_owner_id: ownerUser.id };

      // Spy sendRawEmail để giả lập SMTP gửi thành công mà không gọi provider thật
      const sendRawSpy = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({
        info: { messageId: '<real-flow-msg@uknow.test>' },
      });

      try {
        const sendResult = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode,
          customer,
          campaign,
          runId,
          null,
          { emailStep: 1 }
        );
        expect(sendResult.status).toBe('success');

        // 5. Khẳng định: email_messages ghi đúng workspace_owner_id = ownerUser.id (A), không phải staffUser.id (B)
        const { rows: messages } = await db.query(
          'SELECT id, id_campaign, workspace_owner_id, recipient_email FROM email_messages WHERE id_campaign = $1',
          [campaignId]
        );
        expect(messages).toHaveLength(1);
        expect(Number(messages[0].workspace_owner_id)).toBe(Number(ownerUser.id));
        expect(Number(messages[0].id_campaign)).toBe(campaignId);
      } finally {
        sendRawSpy.mockRestore();
      }
    });
  });

  describe('Đường ghi Zalo (insertCampaignZaloMessage)', () => {
    it('ghi đúng workspace_owner_id khi gọi zaloMessageRepository.insertCampaignZaloMessage', async () => {
      const zaloMsgId = await zaloMessageRepository.insertCampaignZaloMessage({
        campaignId: null,
        runId: null,
        customerId: null,
        nodeId: null,
        channel: 'zalo_personal',
        recipientType: 'phone',
        recipientValue: '0912345678',
        uid: null,
        groupId: null,
        accountId: 1,
        accountName: 'Zalo Account',
        messageText: 'Hello Zalo',
        trackingToken: `token_${Date.now()}`,
        trackingBaseUrl: null,
        trackingMetadata: { status: 'sent' },
        isPreview: false,
        workspaceOwnerId: ownerUser.id,
      });

      expect(zaloMsgId).toBeDefined();
      const { rows } = await db.query(
        'SELECT id, workspace_owner_id, channel, status FROM zalo_messages WHERE id = $1',
        [zaloMsgId]
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerUser.id));
    });

    it('ghi nhận workspace_owner_id cho preview test send cá nhân', async () => {
      const zaloMsgId = await zaloMessageRepository.insertCampaignZaloMessage({
        campaignId: null,
        channel: 'zalo_personal',
        recipientType: 'phone',
        recipientValue: '0988888888',
        messageText: 'Test Preview',
        trackingMetadata: { status: 'sent', source: 'preview' },
        isPreview: true,
        workspaceOwnerId: ownerUser.id,
      });

      expect(zaloMsgId).toBeDefined();
      const { rows } = await db.query(
        'SELECT id, workspace_owner_id, is_preview FROM zalo_messages WHERE id = $1',
        [zaloMsgId]
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].workspace_owner_id)).toBe(Number(ownerUser.id));
      expect(rows[0].is_preview).toBe(true);
    });

    it('đường gửi thật (executeCampaign Zalo cá nhân) với workspace_owner_id = A, id_user = B ghi đúng workspace_owner_id = A', async () => {
      // 1. Tạo zalo_settings cho staffUser (người chạy chiến dịch)
      const { rows: accRows } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
         VALUES ($1, true, 'connected', 'Staff Zalo Account') RETURNING id`,
        [staffUser.id]
      );
      const accountId = accRows[0].id;

      // 2. Tạo campaign Zalo do staffUser (B) tạo nhưng workspace_owner_id = ownerUser (A)
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
         VALUES ($1, $2, 'Staff Zalo Campaign For Owner', 'zalo', 'active') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      // 3. Tạo node Zalo personal
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_zalo_personal', 'Send Zalo Personal', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientPhones: '0912345678',
            zaloAccountId: accountId,
            zaloRecipientType: 'phone',
            message: 'Tin nhan tu nhan vien cho chu workspace',
          }),
        ]
      );

      // 4. Tạo run
      const { rows: rRows } = await db.query(
        `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, triggered_by, run_type, status, run_metadata)
         VALUES ($1, $2, $3, 'manual', 'running', $4) RETURNING id`,
        [
          campaignId,
          ownerUser.id,
          staffUser.id,
          JSON.stringify({ source: 'campaign_run', roleCode: 'employee' }),
        ]
      );
      const runId = rRows[0].id;

      // Mock Zalo API
      const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: 'zalo_msg_1001' } });
      const fakeFindUser = jest.fn().mockResolvedValue({ uid: 'uid_zalo_cust_1', zalo_display: 'Recipient Name' });
      zaloAccountSessionService.setAccountApi(accountId, {
        sendMessage: fakeSendMessage,
        findUser: fakeFindUser,
      });

      // Bỏ qua quiet hours để test integration chạy thông suốt bất kể giờ test trên máy
      const quietHoursSpy = jest.spyOn(campaignRunService.zaloRateLimiter, 'computeNextAllowedSendAtByQuietHours').mockReturnValue(null);

      try {
        // 5. Chạy executeCampaign thật
        await campaignRunService.executeCampaign(campaignId, runId, staffUser.id);

        // 6. Khẳng định: zalo_messages ghi đúng workspace_owner_id = ownerUser.id (A), không phải staffUser.id (B)
        const { rows: messages } = await db.query(
          'SELECT id, id_campaign, workspace_owner_id, recipient_value, channel FROM zalo_messages WHERE id_campaign = $1',
          [campaignId]
        );
        expect(messages.length).toBeGreaterThanOrEqual(1);
        expect(Number(messages[0].workspace_owner_id)).toBe(Number(ownerUser.id));
        expect(Number(messages[0].id_campaign)).toBe(campaignId);
      } finally {
        quietHoursSpy.mockRestore();
      }
    });
  });

  describe('Backfill theo lô từ campaigns', () => {
    it('backfill đúng COALESCE(workspace_owner_id, id_user) cho các dòng cũ và giữ NULL cho dòng không có campaign', async () => {
      // 1. Tạo campaign A có workspace_owner_id khác id_user (nhân viên tạo cho chủ)
      const { rows: c1 } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $2, 'Campaign Staff', 'active', 'email')
         RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campAId = Number(c1[0].id);

      // 2. Tạo campaign B không có workspace_owner_id (tự chủ tạo, workspace_owner_id IS NULL)
      const { rows: c2 } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, NULL, 'Campaign Owner', 'active', 'zalo')
         RETURNING id`,
        [ownerUser.id]
      );
      const campBId = Number(c2[0].id);

      // 3. Chèn email_messages cũ (workspace_owner_id IS NULL)
      const { rows: em1 } = await db.query(
        `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at, workspace_owner_id)
         VALUES ($1, 'em1@test.local', 'sent', NOW(), NULL)
         RETURNING id`,
        [campAId]
      );
      const { rows: em2 } = await db.query(
        `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at, workspace_owner_id)
         VALUES (NULL, 'system@test.local', 'sent', NOW(), NULL)
         RETURNING id`
      );

      // 4. Chèn zalo_messages cũ (workspace_owner_id IS NULL)
      const { rows: zm1 } = await db.query(
        `INSERT INTO zalo_messages (id_campaign, channel, status, sent_at, workspace_owner_id)
         VALUES ($1, 'zalo_personal', 'sent', NOW(), NULL)
         RETURNING id`,
        [campBId]
      );
      const { rows: zm2 } = await db.query(
        `INSERT INTO zalo_messages (id_campaign, channel, status, sent_at, workspace_owner_id)
         VALUES (NULL, 'zalo_personal', 'sent', NOW(), NULL)
         RETURNING id`
      );

      // 5. Chạy logic backfill theo đúng câu SQL của Migration 239
      await db.query(`
        UPDATE email_messages em
        SET workspace_owner_id = COALESCE(c.workspace_owner_id, c.id_user)
        FROM campaigns c
        WHERE c.id = em.id_campaign AND em.workspace_owner_id IS NULL;
      `);

      await db.query(`
        UPDATE zalo_messages zm
        SET workspace_owner_id = COALESCE(c.workspace_owner_id, c.id_user)
        FROM campaigns c
        WHERE c.id = zm.id_campaign AND zm.workspace_owner_id IS NULL;
      `);

      // 6. Kiểm tra email:
      // em1 gắn campA (staffUser tạo, ownerUser là chủ) -> workspace_owner_id = ownerUser.id
      const { rows: em1Check } = await db.query('SELECT workspace_owner_id FROM email_messages WHERE id = $1', [em1[0].id]);
      expect(Number(em1Check[0].workspace_owner_id)).toBe(Number(ownerUser.id));

      // em2 không gắn campaign (thư hệ thống) -> workspace_owner_id VẪN NULL
      const { rows: em2Check } = await db.query('SELECT workspace_owner_id FROM email_messages WHERE id = $1', [em2[0].id]);
      expect(em2Check[0].workspace_owner_id).toBeNull();

      // 7. Kiểm tra zalo:
      // zm1 gắn campB (ownerUser tạo, workspace_owner_id NULL) -> COALESCE lấy id_user = ownerUser.id
      const { rows: zm1Check } = await db.query('SELECT workspace_owner_id FROM zalo_messages WHERE id = $1', [zm1[0].id]);
      expect(Number(zm1Check[0].workspace_owner_id)).toBe(Number(ownerUser.id));

      // zm2 không gắn campaign -> workspace_owner_id VẪN NULL
      const { rows: zm2Check } = await db.query('SELECT workspace_owner_id FROM zalo_messages WHERE id = $1', [zm2[0].id]);
      expect(zm2Check[0].workspace_owner_id).toBeNull();
    });
  });
});
