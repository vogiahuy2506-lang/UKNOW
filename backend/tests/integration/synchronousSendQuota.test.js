import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';

const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-sync-message-id@uknow.test>',
  accepted: ['recipient@example.com'],
});
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: mockVerify,
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
  createTransport: mockCreateTransport,
}));

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const emailSettingsSmtpService = (await import('../../src/services/email/emailSettingsSmtp.service.js')).default;
const emailSettingsController = (await import('../../src/controllers/emailSettings.controller.js')).default;
const emailSettingsRepository = (await import('../../src/repositories/email/emailSettings.repository.js')).default;
const campaignQuickSendService = (await import('../../src/services/campaign/campaignQuickSend.service.js')).default;
const unifiedInboxService = (await import('../../src/services/chatbot/unifiedInbox.service.js')).default;
const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');

describe('Integration — Synchronous Send Atomic Quota Reservation Protocol', () => {
  let user;
  const mockDeps = {
    createSmtpTransporter: () => ({
      sendMail: async () => ({
        messageId: '<test-sync-message-id@uknow.test>',
        accepted: ['recipient@example.com'],
      }),
    }),
    normalizeEmailList: (v) => (Array.isArray(v) ? v : (v ? [v] : [])),
    buildTrackedHtml: async (html) => html,
    buildMailAttachments: async () => [],
    formatUtc7: () => '2026-09-01 23:30:00',
  };

  beforeEach(async () => {
    await truncateAll();
    mockVerify.mockClear().mockResolvedValue(true);
    mockSendMail.mockClear().mockResolvedValue({
      messageId: '<test-sync-message-id@uknow.test>',
      accepted: ['recipient@example.com'],
    });
    mockCreateTransport.mockClear().mockReturnValue({
      verify: mockVerify,
      sendMail: mockSendMail,
    });

    user = await createUser({
      email: `sync_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
  });

  afterAll(() => {
    delete process.env.TEST_SEND_EMAIL;
  });

  describe('Direct Email Send (emailSettingsSmtpService)', () => {
    it('successfully reserves and consumes quota on sendTestEmail in enforce mode', async () => {
      // 1. Create email setting in DB
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Test Sender', 'sender@example.com', 'smtp.example.com', 465, 'sender@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const result = await emailSettingsSmtpService.sendTestEmail({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        id: emailSettingId,
        payload: {
          to: 'recipient@example.com',
          subject: 'Hello test',
          content: 'Body content',
        },
      }, mockDeps);

      expect(result.messageId).toBe('<test-sync-message-id@uknow.test>');

      // Verify email_settings sent count incremented
      const updatedSetting = await emailSettingsRepository.getById(user.id, emailSettingId);
      expect(updatedSetting.total_sent_count).toBeGreaterThanOrEqual(1);

      // Verify quota reservation was written and consumed in PostgreSQL DB
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations.length).toBeGreaterThanOrEqual(1);
      expect(reservations[0].status).toBe('consumed');
    });

    it('successfully reserves and consumes quota on sendCustomEmail in enforce mode', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Custom Sender', 'custom@example.com', 'smtp.example.com', 465, 'custom@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const result = await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        payload: {
          fromEmailId: emailSettingId,
          to: 'customer@example.com',
          subject: 'Order receipt',
          content: 'Your order details',
          previewMode: true,
          saveMessageLog: true,
        },
        trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'integration_test' },
      }, mockDeps);

      expect(result.messageId).toBe('<test-sync-message-id@uknow.test>');

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations.length).toBeGreaterThanOrEqual(1);
      expect(reservations[0].status).toBe('consumed');
    });

    it('releases quota when SMTP throws error', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Failing Sender', 'fail@example.com', 'smtp.example.com', 465, 'fail@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const failingDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            throw new Error('SMTP connection refused');
          },
        }),
      };

      await expect(
        emailSettingsSmtpService.sendTestEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          id: emailSettingId,
          payload: {
            to: 'recipient_fail@example.com',
            subject: 'Fail test',
            content: 'Body content',
          },
        }, failingDeps)
      ).rejects.toThrow('SMTP connection refused');

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations.length).toBeGreaterThanOrEqual(1);
      expect(reservations[0].status).toBe('released');
    });

    it('replays previously consumed reservation without re-sending or double quota decrement', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Replay Sender', 'replay@example.com', 'smtp.example.com', 465, 'replay@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      let callCount = 0;
      const countingDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            callCount++;
            return {
              messageId: '<test-sync-replay-id@uknow.test>',
              accepted: ['recipient_replay@example.com'],
            };
          },
        }),
      };

      const sendArgs = {
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        id: emailSettingId,
        payload: {
          to: 'recipient_replay@example.com',
          subject: 'Replay test',
          content: 'Body content',
          idempotencyKey: 'test_sync_replay_key_1',
        },
      };

      const res1 = await emailSettingsSmtpService.sendTestEmail(sendArgs, countingDeps);
      expect(res1.messageId).toBe('<test-sync-replay-id@uknow.test>');
      expect(callCount).toBe(1);

      // Second identical call (replay)
      const res2 = await emailSettingsSmtpService.sendTestEmail(sendArgs, countingDeps);
      expect(res2.isReplay).toBe(true);
      expect(callCount).toBe(1); // Provider NOT called again!
    });
  });

  describe('Quick Send Message (campaignQuickSendService)', () => {
    it('executes email quick-send with atomic quota reservation', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Quick Sender', 'quick@example.com', 'smtp.example.com', 465, 'quick@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const result = await campaignQuickSendService.sendQuickTestMessage({
        actorUserId: user.id,
        workspaceOwnerId: user.id,
        roleCode: 'user',
        channel: 'email',
        recipient: 'test_quick@example.com',
        subject: 'Quick test',
        message: 'This is a quick test email body',
        accountId: emailSettingId,
      });

      expect(result.to).toBe('test_quick@example.com');

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations.length).toBeGreaterThanOrEqual(1);
      expect(reservations[0].status).toBe('consumed');
    });
  });

  describe('Unified Inbox (unifiedInboxService)', () => {
    // Không có fake session thì zaloPersonal.adapter.getSessionByAccountId() trả null,
    // sendReply() trả {success:false, error:'No active Zalo personal session'} — nhưng
    // unifiedInboxService.sendMessage() vẫn trả {success:true, sendStatus:'failed'} ở tầng
    // ngoài (success:true nghĩa là "hàm không throw", không phải "gửi thành công"). Test
    // cũ chỉ check result.success/message tồn tại/reservation tồn tại nên xanh giả — không
    // phát hiện được khi provider thất bại và reservation bị release thay vì consumed.
    const activeFakeSessionAccountIds = [];

    afterEach(() => {
      while (activeFakeSessionAccountIds.length > 0) {
        const accountId = activeFakeSessionAccountIds.pop();
        zaloAccountSessionService.clearAccountApi(accountId);
      }
    });

    it('executes Zalo personal sendMessage with atomic quota reservation and persists message', async () => {
      // 1. Create Zalo setting and conversation
      const { rows: zRows } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
         VALUES ($1, true, 'connected', 'Zalo Bot')
         RETURNING id`,
        [user.id]
      );
      const zaloSettingId = zRows[0].id;

      const fakeZaloSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '9876543210' } });
      zaloAccountSessionService.setAccountApi(zaloSettingId, { sendMessage: fakeZaloSendMessage });
      activeFakeSessionAccountIds.push(zaloSettingId);

      const { rows: convRows } = await db.query(
        `INSERT INTO zalo_personal_conversations (
          id_user, id_zalo_setting, external_id, visitor_name, created_at
        ) VALUES (
          $1, $2, 'zalo_ext_123', 'Customer Name', NOW()
        ) RETURNING id`,
        [user.id, zaloSettingId]
      );
      const convId = convRows[0].id;

      const result = await unifiedInboxService.sendMessage(
        user.id,
        convId,
        'zalo_personal',
        'Hello customer from agent',
        [],
        {
          actorUserId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
        }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      // result.success chỉ nói "hàm không throw" — sendStatus mới là kết quả gửi thật.
      expect(result.sendStatus).toBe('sent');
      expect(fakeZaloSendMessage).toHaveBeenCalledTimes(1);

      // Verify message row is stored in DB
      const { rows: msgRows } = await db.query(
        'SELECT * FROM zalo_personal_messages WHERE id = $1',
        [result.messageId]
      );
      expect(msgRows.length).toBe(1);
      expect(msgRows[0].content).toBe('Hello customer from agent');
      expect(msgRows[0].quota_reservation_id).not.toBeNull();

      // Verify quota reservation thực sự CONSUMED (không chỉ tồn tại) — reservation vẫn
      // 'released' khi provider thất bại sẽ lọt qua nếu chỉ check length >= 1.
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE id = $1',
        [msgRows[0].quota_reservation_id]
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('consumed');
    });

    it('reuses and transitions existing reservation on retryMessage without creating duplicate reservation', async () => {
      const { rows: zRows } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
         VALUES ($1, true, 'connected', 'Zalo Bot')
         RETURNING id`,
        [user.id]
      );
      const zaloSettingId = zRows[0].id;
      zaloAccountSessionService.setAccountApi(zaloSettingId, {
        sendMessage: async () => ({ message: { msgId: '1234567890' } }),
      });
      activeFakeSessionAccountIds.push(zaloSettingId);

      const { rows: convRows } = await db.query(
        `INSERT INTO zalo_personal_conversations (
          id_user, id_zalo_setting, external_id, visitor_name, created_at
        ) VALUES (
          $1, $2, 'zalo_retry_ext', 'Retry Customer', NOW()
        ) RETURNING id`,
        [user.id, zaloSettingId]
      );
      const convId = convRows[0].id;

      // Create a released reservation for previous failed message
      const resKey = `direct:zalo:${user.id}:h_112233445566778899aa:1122334455667788`;
      const fp = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const { rows: resRows } = await db.query(
        `INSERT INTO send_quota_reservations (
          billing_user_id, channel, quantity, status, reservation_key,
          request_fingerprint, fingerprint_version, source_type, vn_day_start, vn_day_end, expires_at, created_at
        ) VALUES (
          $1, 'zalo', 1, 'released', $2, $3, 'v1', 'direct', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', NOW() + INTERVAL '5 minutes', NOW()
        ) RETURNING id`,
        [user.id, resKey, fp]
      );
      const existingResId = resRows[0].id;

      // Insert existing failed agent message linked to that reservation
      const { rows: msgRows } = await db.query(
        `INSERT INTO zalo_personal_messages (
          id_conversation, id_user, id_zalo_setting, role, content,
          metadata, is_read, quota_reservation_id, created_at
        ) VALUES (
          $1, $2, $3, 'agent', 'Failed text previously',
          '{"send":{"status":"failed","errorDetail":"Timeout"}}'::jsonb, true, $4, NOW()
        ) RETURNING id`,
        [convId, user.id, zaloSettingId, existingResId]
      );
      const failedMsgId = msgRows[0].id;

      // Perform retry
      const retryResult = await unifiedInboxService.retryMessage(
        user.id,
        failedMsgId,
        'zalo_personal',
        {
          actorUserId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
        }
      );

      expect(retryResult.success).toBe(true);

      // Verify new reservation was created and consumed, and linked to message (Finding 3)
      const { rows: updatedMsg } = await db.query(
        'SELECT quota_reservation_id FROM zalo_personal_messages WHERE id = $1',
        [failedMsgId]
      );
      expect(updatedMsg[0].quota_reservation_id).not.toBeNull();
      expect(Number(updatedMsg[0].quota_reservation_id)).not.toBe(existingResId);

      const { rows: newResRows } = await db.query(
        'SELECT status FROM send_quota_reservations WHERE id = $1',
        [updatedMsg[0].quota_reservation_id]
      );
      expect(newResRows[0].status).toBe('consumed');
    });
  });

  describe('Concurrency and Error Semantics Integration', () => {
    it('throws 409 CONCURRENT_SEND_IN_PROGRESS on concurrent request with same reservationKey in reserved/sending state', async () => {
      const resKey = `preview:email:${user.id}:h_112233445566778899aa:1122334455667788`;
      const fp = '1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      // Insert an in-flight reservation
      await db.query(
        `INSERT INTO send_quota_reservations (
          billing_user_id, channel, quantity, status, reservation_key,
          request_fingerprint, fingerprint_version, source_type, vn_day_start, vn_day_end, expires_at, created_at
        ) VALUES (
          $1, 'email', 1, 'sending', $2, $3, 'v2', 'direct', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', NOW() + INTERVAL '5 minutes', NOW()
        )`,
        [user.id, resKey, fp]
      );

      const { reserveSendQuota } = await import('../../src/services/quota/sendQuotaReservation.service.js');

      await expect(
        reserveSendQuota({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          channel: 'email',
          quantity: 1,
          reservationKey: resKey,
          requestFingerprint: fp,
          sourceType: 'direct_email',
        })
      ).rejects.toMatchObject({
        status: 409,
        code: 'CONCURRENT_SEND_IN_PROGRESS',
      });
    });

    it('consumes quota on email hard bounce (550) with failure snapshot in PostgreSQL', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'HB Sender', 'hb@example.com', 'smtp.example.com', 465, 'hb@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const hardBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('550 5.1.1 Recipient unknown');
            err.responseCode = 550;
            throw err;
          },
        }),
      };

      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            fromEmailId: emailSettingId,
            to: 'nonexistent@example.com',
            subject: 'Test hard bounce',
            content: 'Hello',
            previewMode: true,
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, hardBounceDeps)
      ).rejects.toThrow();

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('consumed');
      expect(reservations[0].response_snapshot).toMatchObject({
        failed: true,
        errorType: 'hard_bounce',
      });
    });

    it('consumes quota on sendTestEmail hard bounce (550) with failure snapshot', async () => {
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Test HB Sender', 'testhb@example.com', 'smtp.example.com', 465, 'testhb@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      const hardBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('550 5.1.1 User unknown');
            err.responseCode = 550;
            throw err;
          },
        }),
      };

      await expect(
        emailSettingsSmtpService.sendTestEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          id: emailSettingId,
          payload: {
            to: 'testhb_recipient@example.com',
            subject: 'Test hard bounce',
            content: 'Hello',
            idempotencyKey: 'test_hb_send_test_1',
          },
        }, hardBounceDeps)
      ).rejects.toThrow();

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2 ORDER BY id DESC LIMIT 1',
        [user.id, 'preview:email:%']
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('consumed');
      expect(reservations[0].response_snapshot).toMatchObject({
        failed: true,
        errorType: 'hard_bounce',
      });
    });

    it('persists email_messages with status=bounced and marks customer hard bounced atomically in non-preview mode', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Atomic HB Sender', 'atomichb@example.com', 'smtp.example.com', 465, 'atomichb@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const { rows: custRows } = await db.query(
        `INSERT INTO customers (id_user, email, full_name, email_hard_bounced)
         VALUES ($1, 'atomic_target@example.com', 'Target Customer', false)
         RETURNING id`,
        [user.id]
      );
      const customerId = custRows[0].id;

      const hardBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('550 5.1.1 Recipient mailbox not found');
            err.responseCode = 550;
            throw err;
          },
        }),
      };

      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            customerId,
            fromEmailId: emailSettingId,
            to: 'atomic_target@example.com',
            subject: 'Non-preview HB test',
            content: 'Hello World',
            previewMode: false,
            saveMessageLog: true,
            idempotencyKey: 'atomic_hb_test_key_1',
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, hardBounceDeps)
      ).rejects.toThrow();

      // Verify email_messages row created with status = 'bounced'
      const { rows: msgRows } = await db.query(
        'SELECT * FROM email_messages WHERE recipient_email = $1 ORDER BY id DESC LIMIT 1',
        ['atomic_target@example.com']
      );
      expect(msgRows.length).toBe(1);
      expect(msgRows[0].status).toBe('bounced');
      expect(msgRows[0].quota_reservation_id).not.toBeNull();

      // Verify customer marked as hard bounced
      const { rows: updatedCust } = await db.query(
        'SELECT email_hard_bounced FROM customers WHERE id = $1',
        [customerId]
      );
      expect(updatedCust[0].email_hard_bounced).toBe(true);
    });

    it('SMTP EENVELOPE with responseCode 450 is classified as soft bounce and reservation is cleanly released', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Soft Envelope 450 Sender', 'softenv450@example.com', 'smtp.example.com', 465, 'softenv450@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const softBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('450 4.2.1 Mailbox busy, try again later');
            err.code = 'EENVELOPE';
            err.responseCode = 450;
            throw err;
          },
        }),
      };

      const idempotencyKey = `soft_env_450_${Date.now()}`;
      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            fromEmailId: emailSettingId,
            to: 'soft_target_450@example.com',
            subject: 'Soft bounce 450 test',
            content: 'Hello Soft Bounce 450',
            previewMode: true,
            idempotencyKey,
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, softBounceDeps)
      ).rejects.toThrow();

      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2 ORDER BY id DESC LIMIT 1',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations.length).toBe(1);
      // Soft bounce MUST be released, NOT consumed
      expect(reservations[0].status).toBe('released');
    });

    it('SMTP EENVELOPE with responseCode 451 is classified as soft bounce and reservation is cleanly released', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Soft Envelope 451 Sender', 'softenv451@example.com', 'smtp.example.com', 465, 'softenv451@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const softBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('451 4.3.0 Local error in processing');
            err.code = 'EENVELOPE';
            err.responseCode = 451;
            throw err;
          },
        }),
      };

      const idempotencyKey = `soft_env_451_${Date.now()}`;
      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            fromEmailId: emailSettingId,
            to: 'soft_target_451@example.com',
            subject: 'Soft bounce 451 test',
            content: 'Hello Soft Bounce 451',
            previewMode: true,
            idempotencyKey,
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, softBounceDeps)
      ).rejects.toThrow();

      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2 ORDER BY id DESC LIMIT 1',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations.length).toBe(1);
      // Soft bounce MUST be released, NOT consumed
      expect(reservations[0].status).toBe('released');
    });

    it('consumeSendQuota failure on hard bounce transitions reservation to uncertain with CONSUME_DB_FAILED', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Uncertain HB Sender', 'uncertainhb@example.com', 'smtp.example.com', 465, 'uncertainhb@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const hardBounceDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('550 5.1.1 User not found');
            err.responseCode = 550;
            throw err;
          },
        }),
        consumeSendQuota: async () => {
          const dbErr = new Error('Database disk I/O failure during consume');
          dbErr.status = 500;
          throw dbErr;
        },
      };

      const idempotencyKey = `uncertain_hb_test_${Date.now()}`;
      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            fromEmailId: emailSettingId,
            to: 'uncertain_target@example.com',
            subject: 'Uncertain HB test',
            content: 'Hello Uncertain',
            previewMode: true,
            idempotencyKey,
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, hardBounceDeps)
      ).rejects.toThrow();

      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2 ORDER BY id DESC LIMIT 1',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('uncertain');
      expect(reservations[0].failure_code).toBe('CONSUME_DB_FAILED');
    });

    it('transaction rollback guarantees zero DB side effects outside transaction when SMTP fails', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Tx Rollback Sender', 'txrollback@example.com', 'smtp.example.com', 465, 'txrollback@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const { rows: custRows } = await db.query(
        `INSERT INTO customers (id_user, email, full_name, email_hard_bounced)
         VALUES ($1, 'tx_rollback_target@example.com', 'Rollback Customer', false)
         RETURNING id`,
        [user.id]
      );
      const customerId = custRows[0].id;

      const transientFailDeps = {
        ...mockDeps,
        createSmtpTransporter: () => ({
          sendMail: async () => {
            const err = new Error('ETIMEDOUT Connection lost');
            err.code = 'ETIMEDOUT';
            throw err;
          },
        }),
      };

      const idempotencyKey = `tx_rollback_test_${Date.now()}`;
      await expect(
        emailSettingsSmtpService.sendCustomEmail({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          payload: {
            customerId,
            fromEmailId: emailSettingId,
            to: 'tx_rollback_target@example.com',
            subject: 'Rollback test',
            content: 'Hello Rollback',
            previewMode: false,
            saveMessageLog: true,
            idempotencyKey,
          },
          trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'test' },
        }, transientFailDeps)
      ).rejects.toThrow();

      // Verify zero email_messages rows
      const { rows: msgRows } = await db.query(
        'SELECT * FROM email_messages WHERE recipient_email = $1',
        ['tx_rollback_target@example.com']
      );
      expect(msgRows).toHaveLength(0);

      // Verify customer email_hard_bounced remains false
      const { rows: custAfter } = await db.query(
        'SELECT email_hard_bounced FROM customers WHERE id = $1',
        [customerId]
      );
      expect(custAfter[0].email_hard_bounced).toBe(false);

      // Verify reservation on timeout is marked uncertain to prevent double-spending while awaiting reconciliation
      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2 ORDER BY id DESC LIMIT 1',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations[0].status).toBe('uncertain');
      expect(reservations[0].failure_code).toBe('SMTP_NETWORK_TIMEOUT');
    });

    it('throws 409 IDEMPOTENCY_KEY_REUSED when reusing same key with different attachments', async () => {
      const { reserveSendQuota } = await import('../../src/services/quota/sendQuotaReservation.service.js');
      const { buildDirectReservationKey, computeRequestFingerprint } = await import('../../src/services/quota/sendQuotaKey.service.js');

      const clientKey = 'idempotency_diff_attachment_test_1';
      const recipient = 'diff_att@example.com';
      const reservationKey = buildDirectReservationKey({
        channel: 'email',
        billingUserId: user.id,
        clientKey,
        recipient,
      });

      const payload1 = {
        channel: 'email',
        to: recipient,
        subject: 'Same Subject',
        content: 'Same Content',
        attachments: [{ name: 'file1.pdf', size: 1024 }],
      };
      const fp1 = computeRequestFingerprint(payload1);

      const res1 = await reserveSendQuota({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey,
        requestFingerprint: fp1,
        requestPayload: payload1,
        sourceType: 'direct_email',
      });
      expect(res1.status).toBe('reserved');

      // Second request with SAME key but DIFFERENT attachments
      const payload2 = {
        channel: 'email',
        to: recipient,
        subject: 'Same Subject',
        content: 'Same Content',
        attachments: [{ name: 'file2.png', size: 2048 }],
      };
      const fp2 = computeRequestFingerprint(payload2);
      expect(fp1).not.toBe(fp2);

      await expect(
        reserveSendQuota({
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          channel: 'email',
          quantity: 1,
          reservationKey,
          requestFingerprint: fp2,
          requestPayload: payload2,
          sourceType: 'direct_email',
        })
      ).rejects.toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    });
  });

  describe('Legacy Mode off — Zero Double-Debit Integration Test', () => {
    let origMode;

    beforeAll(() => {
      origMode = process.env.SEND_QUOTA_RESERVATION_MODE;
      process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
    });

    afterAll(() => {
      process.env.SEND_QUOTA_RESERVATION_MODE = origMode;
    });

    it('mode off: sendCustomEmail with saveMessageLog:false and CC does not double debit or write reservations', async () => {
      // 1. Create email setting in DB
      const { rows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Legacy Sender', 'sender@example.com', 'smtp.example.com', 465, 'sender@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = rows[0].id;

      // 2. Send email with 1 to + 1 cc (quantity = 2) and saveMessageLog: false
      const result = await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        payload: {
          fromEmailId: emailSettingId,
          to: 'direct1@example.com',
          cc: ['cc1@example.com'],
          subject: 'Mode off test',
          content: 'Testing mode off direct send',
          saveMessageLog: false,
        },
      }, mockDeps);

      expect(result.messageId).toBe('<test-sync-message-id@uknow.test>');

      // Verify ZERO reservations created in mode 'off'
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations).toHaveLength(0);

      // Verify usage_logs recorded exactly 1 row with delta = 2
      const { rows: usageLogs } = await db.query(
        'SELECT * FROM usage_logs WHERE id_user = $1 AND resource_type = $2',
        [user.id, 'email_direct_send']
      );
      expect(usageLogs).toHaveLength(1);
      expect(usageLogs[0].delta).toBe(2);

      // Verify ZERO topup_debits rows (within free plan limit)
      const { rows: debits } = await db.query(
        'SELECT * FROM topup_debits WHERE user_id = $1',
        [user.id]
      );
      expect(debits).toHaveLength(0);
    });

    it('mode off: topup wallet debit accurately tracks exact recipient count without double debit across saveMessageLog true/false', async () => {
      // 1. Set user plan limits to 1 monthly email so subsequent sends use top-up wallet
      const { rows: planRows } = await db.query(
        `INSERT INTO plans (
          code, name, price,
          daily_email_limit, monthly_email_limit,
          daily_zalo_limit, monthly_zalo_limit,
          messages_per_period, is_active
        ) VALUES (
          $1, 'Plan Limit 1', 0,
          100, 1, 100, 100, 1000, true
        ) RETURNING id`,
        [`plan_1_${Date.now()}`]
      );
      await db.query(
        'UPDATE users SET active_plan_id = $1 WHERE id = $2',
        [planRows[0].id, user.id]
      );

      // 2. Add topup wallet balance: 10 emails
      const { rows: orderRows } = await db.query(
        `INSERT INTO orders (user_id, order_code, amount, status)
         VALUES ($1, $2, 50000, 'success')
         RETURNING id`,
        [user.id, Date.now()]
      );
      await db.query(
        `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
         VALUES ($1, 'emails', 10, $2, NULL)`,
        [user.id, orderRows[0].id]
      );

      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Topup Sender', 'topup@example.com', 'smtp.example.com', 465, 'topup@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      // Exhaust the 1 plan email first
      await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        payload: {
          fromEmailId: emailSettingId,
          to: 'exhaust@example.com',
          subject: 'Exhaust plan quota',
          content: 'Exhausting 1 plan email',
          saveMessageLog: false,
        },
      }, mockDeps);

      // Verify ZERO debits for the first email within plan
      const { rows: debits0 } = await db.query(
        'SELECT * FROM topup_debits WHERE user_id = $1',
        [user.id]
      );
      expect(debits0).toHaveLength(0);

      // 3. Send email with 1 to + 1 cc + 1 bcc (total 3 recipients) with saveMessageLog: true
      await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        payload: {
          fromEmailId: emailSettingId,
          to: 'to@example.com',
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Topup debit test 1',
          content: 'Content 1',
          saveMessageLog: true,
        },
      }, mockDeps);

      // Check debits: exactly 3 emails debited
      const { rows: debits1 } = await db.query(
        'SELECT * FROM topup_debits WHERE user_id = $1 ORDER BY id ASC',
        [user.id]
      );
      const totalDebited1 = debits1.reduce((sum, d) => sum + Number(d.qty), 0);
      expect(totalDebited1).toBe(3);

      // 4. Send email with 1 recipient and saveMessageLog: false
      await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        payload: {
          fromEmailId: emailSettingId,
          to: 'single@example.com',
          subject: 'Topup debit test 2',
          content: 'Content 2',
          saveMessageLog: false,
        },
      }, mockDeps);

      // Check debits: exactly 1 more email debited (total = 4)
      const { rows: debits2 } = await db.query(
        'SELECT * FROM topup_debits WHERE user_id = $1 ORDER BY id ASC',
        [user.id]
      );
      const totalDebited2 = debits2.reduce((sum, d) => sum + Number(d.qty), 0);
      expect(totalDebited2).toBe(4);

      // Verify wallet balance is exactly 6
      const { getWalletBalance } = await import('../../src/repositories/payment/topup.repository.js');
      const balance = await getWalletBalance(user.id, 'emails');
      expect(balance.remaining).toBe(6);
    });
  });

  describe('Active Allowlist Lifecycle Integration (SEND_QUOTA_RESERVATION_SOURCES)', () => {
    const origSources = process.env.SEND_QUOTA_RESERVATION_SOURCES;

    beforeEach(() => {
      process.env.SEND_QUOTA_RESERVATION_SOURCES = 'direct_email,zalo_preview,quick_send,inbox';
    });

    afterEach(() => {
      if (origSources === undefined) {
        delete process.env.SEND_QUOTA_RESERVATION_SOURCES;
      } else {
        process.env.SEND_QUOTA_RESERVATION_SOURCES = origSources;
      }
    });

    it('admitted direct_email fully progresses through reserved -> sending -> consumed with active allowlist', async () => {
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Allowlist Direct Sender', 'allowlist_direct@example.com', 'smtp.example.com', 465, 'allowlist_direct@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const idempotencyKey = `allowlist_direct_${Date.now()}`;
      const result = await emailSettingsSmtpService.sendCustomEmail({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        payload: {
          fromEmailId: emailSettingId,
          to: 'allowlist_direct_target@example.com',
          subject: 'Allowlist Direct Test',
          content: 'Testing allowlist direct_email',
          saveMessageLog: true,
          idempotencyKey,
        },
        trackingConfig: { baseUrl: 'http://localhost:5001', isPublic: false, source: 'direct_email' },
      }, mockDeps);

      expect(result.messageId).toBeTruthy();

      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('consumed');
      expect(reservations[0].source_type).toBe('direct_email');
    });

    it('Quick Send Email uses quick_send taxonomy and settles to consumed under allowlist', async () => {
      const campaignQuickSendService = (await import('../../src/services/campaign/campaignQuickSend.service.js')).default;
      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Quick Send Email Sender', 'qs_email@example.com', 'smtp.example.com', 465, 'qs_email@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      const idempotencyKey = `quick_send_email_${Date.now()}`;
      const result = await campaignQuickSendService.sendQuickTestMessage({
        actorUserId: user.id,
        workspaceOwnerId: user.id,
        roleCode: 'user',
        channel: 'email',
        recipient: 'qs_target@example.com',
        subject: 'Quick Send Email Subject',
        message: 'Quick Send Email Message Body',
        accountId: emailSettingId,
      }, {
        idempotencyKey,
        ...mockDeps,
      });

      expect(result.messageId).toBeTruthy();

      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2',
        [user.id, `%${hashClientSegment(idempotencyKey)}%`]
      );
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('consumed');
      expect(reservations[0].source_type).toBe('quick_send');
      expect(reservations[0].reservation_key).toMatch(/^quick:email:/);
    });

    it('unlisted source is safely bypassed to mode off during admission without throwing or executing persistSource', async () => {
      const { reserveSendQuota, markSendQuotaSending, consumeSendQuota } = await import(
        '../../src/services/quota/sendQuotaReservation.service.js'
      );

      const admission = await reserveSendQuota({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: `unlisted:test:${Date.now()}`,
        requestFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sourceType: 'unlisted_batch_source',
      });

      expect(admission.mode).toBe('off');
      expect(admission.skippedByAllowlist).toBe(true);
      expect(admission.id).toBeNull();

      // Lifecycle methods with null reservationId must be safe no-op stubs
      const sendingResult = await markSendQuotaSending({ reservationId: admission.id });
      expect(sendingResult.mode).toBe('off');
      expect(sendingResult.status).toBe('sending');

      const mockPersist = jest.fn();
      const consumeResult = await consumeSendQuota({
        reservationId: admission.id,
        persistSource: mockPersist,
      });
      expect(consumeResult.mode).toBe('off');
      expect(consumeResult.status).toBe('consumed');
      expect(mockPersist).not.toHaveBeenCalled();
    });

    it('reservation admitted under allowlist can settle even if allowlist is dynamically cleared or changed', async () => {
      const { reserveSendQuota, markSendQuotaSending, consumeSendQuota } = await import(
        '../../src/services/quota/sendQuotaReservation.service.js'
      );

      const { buildDirectReservationKey } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const canonicalKey = buildDirectReservationKey({
        channel: 'email',
        billingUserId: user.id,
        clientKey: `dynamic_test_${Date.now()}`,
        recipient: 'dynamic@example.com',
      });

      // 1. Admitted when direct_email is in allowlist
      const admission = await reserveSendQuota({
        userId: user.id,
        roleCode: 'user',
        ownerContextId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: canonicalKey,
        requestFingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        sourceType: 'direct_email',
      });

      expect(admission.mode).toBe('enforce');
      expect(admission.id).toBeTruthy();

      // 2. Allowlist dynamically changed to exclude direct_email
      process.env.SEND_QUOTA_RESERVATION_SOURCES = 'zalo_preview';

      // 3. markSending and consume on admitted reservation MUST NOT fail or be blocked by allowlist
      const sendingResult = await markSendQuotaSending({ reservationId: admission.id });
      expect(sendingResult.status).toBe('sending');

      let persistRan = false;
      const consumeResult = await consumeSendQuota({
        reservationId: admission.id,
        persistSource: async (tx) => {
          persistRan = true;
          await tx.query('SELECT 1');
        },
      });
      expect(consumeResult.status).toBe('consumed');
      expect(persistRan).toBe(true);

      const { rows } = await db.query(
        'SELECT status FROM send_quota_reservations WHERE id = $1',
        [admission.id]
      );
      expect(rows[0].status).toBe('consumed');
    });

    it('HTTP/Controller regression: sendCustomEmail and sendTestEmail ignore client payload sourceType and enforce direct_email', async () => {
      // 1. Only quick_send is allowed in rollout; direct_email is not admitted
      process.env.SEND_QUOTA_RESERVATION_SOURCES = 'quick_send';

      const { rows: settingRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Controller Spoof Sender', 'ctrl_spoof@example.com', 'smtp.example.com', 465, 'ctrl_spoof@example.com', $2, 'active', true)
         RETURNING id`,
        [user.id, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = settingRows[0].id;

      // ── A. Controller sendCustomEmail with malicious client body ───────────────
      const customIdempotencyKey = `ctrl_custom_${Date.now()}`;
      let customResStatus = 200;
      let customResBody = null;
      const customReq = {
        user: { id: user.id, role: 'user' },
        headers: { 'idempotency-key': customIdempotencyKey },
        body: {
          fromEmailId: emailSettingId,
          to: 'victim_custom@example.com',
          subject: 'Spoof via Custom Email Controller',
          content: 'Payload body contains spoofed sourceType',
          sourceType: 'quick_send', // MALICIOUS CLIENT BODY SPOOF
        },
        protocol: 'http',
        get: (hdr) => (hdr === 'host' ? 'localhost:5001' : undefined),
      };
      const customRes = {
        status(code) {
          customResStatus = code;
          return this;
        },
        json(data) {
          customResBody = data;
          return this;
        },
      };

      await emailSettingsController.sendCustomEmail(customReq, customRes);
      expect(customResStatus).toBe(200);
      expect(customResBody?.success).toBe(true);

      // Verify in DB: Controller attached trusted direct_email, which is NOT in allowlist -> 0 reservations created
      const { hashClientSegment } = await import('../../src/services/quota/sendQuotaKey.service.js');
      const { rows: customReservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2',
        [user.id, `%${hashClientSegment(customIdempotencyKey)}%`]
      );
      expect(customReservations.length).toBe(0);

      // ── B. Controller sendTestEmail with malicious client body ─────────────────
      const testIdempotencyKey = `ctrl_test_${Date.now()}`;
      let testResStatus = 200;
      let testResBody = null;
      const testReq = {
        user: { id: user.id, role: 'user' },
        params: { id: emailSettingId },
        headers: { 'idempotency-key': testIdempotencyKey },
        body: {
          to: 'victim_test@example.com',
          subject: 'Spoof via Test Email Controller',
          content: 'Payload body contains spoofed sourceType',
          sourceType: 'quick_send', // MALICIOUS CLIENT BODY SPOOF
        },
      };
      const testRes = {
        status(code) {
          testResStatus = code;
          return this;
        },
        json(data) {
          testResBody = data;
          return this;
        },
      };

      await emailSettingsController.sendTestEmail(testReq, testRes);
      expect(testResStatus).toBe(200);
      expect(testResBody?.success).toBe(true);

      const { rows: testReservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2',
        [user.id, `%${hashClientSegment(testIdempotencyKey)}%`]
      );
      expect(testReservations.length).toBe(0);

      // ── C. Under direct_email allowlist, verify controller records direct_email taxonomy in DB ──
      process.env.SEND_QUOTA_RESERVATION_SOURCES = 'direct_email';
      const admittedKey = `ctrl_admitted_${Date.now()}`;
      const admittedReq = {
        user: { id: user.id, role: 'user' },
        headers: { 'idempotency-key': admittedKey },
        body: {
          fromEmailId: emailSettingId,
          to: 'admitted_victim@example.com',
          subject: 'Admitted Direct Email Controller',
          content: 'Legitimate direct email',
          sourceType: 'quick_send', // Client attempts to pass quick_send
        },
        protocol: 'http',
        get: (hdr) => (hdr === 'host' ? 'localhost:5001' : undefined),
      };
      await emailSettingsController.sendCustomEmail(admittedReq, customRes);

      const { rows: admittedReservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND reservation_key LIKE $2',
        [user.id, `%${hashClientSegment(admittedKey)}%`]
      );
      expect(admittedReservations.length).toBe(1);
      // DB reservation MUST be direct_email (controller trusted option), NOT client body quick_send
      expect(admittedReservations[0].source_type).toBe('direct_email');
    });
  });
});
