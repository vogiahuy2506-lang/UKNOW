import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';

const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-q4c-msg-id@uknow.test>',
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

const savedInitialEnv = {
  SMTP_SECRET_KEY: process.env.SMTP_SECRET_KEY,
  TEST_SEND_EMAIL: process.env.TEST_SEND_EMAIL,
  SEND_QUOTA_RESERVATION_MODE: process.env.SEND_QUOTA_RESERVATION_MODE,
  SEND_QUOTA_RESERVATION_SOURCES: process.env.SEND_QUOTA_RESERVATION_SOURCES,
  BULLMQ_ENABLED: process.env.BULLMQ_ENABLED,
  ZALO_TIMEOUT_RETRY_BASE_DELAY_MS: process.env.ZALO_TIMEOUT_RETRY_BASE_DELAY_MS,
};

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
process.env.BULLMQ_ENABLED = 'false';
process.env.ZALO_TIMEOUT_RETRY_BASE_DELAY_MS = '1';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, assignPlanToUser } = await import('./helpers/db.js');
const campaignEmailSenderService = (await import('../../src/services/campaign/campaignEmailSender.service.js')).default;
const campaignZaloSenderService = (await import('../../src/services/campaign/campaignZaloSender.service.js')).default;
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');
const {
  findStaleCampaignRunReservations,
  transitionReservationState,
  findReservationByKey,
} = await import('../../src/repositories/sendQuota.repository.js');
const { buildCampaignReservationKey } = await import('../../src/services/quota/sendQuotaKey.service.js');

registerOutboundMessageProcessors();

describe('Integration — Campaign Quota Matrix PR-Q4c', () => {
  let user;
  const activeFakeZaloAccountIds = [];

  beforeEach(async () => {
    await truncateAll();
    process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
    delete process.env.SEND_QUOTA_RESERVATION_SOURCES;

    mockVerify.mockClear().mockResolvedValue(true);
    mockSendMail.mockClear().mockResolvedValue({
      messageId: '<test-q4c-msg-id@uknow.test>',
      accepted: ['recipient@example.com'],
    });
    mockCreateTransport.mockClear().mockReturnValue({
      verify: mockVerify,
      sendMail: mockSendMail,
    });

    user = await createUser({
      email: `q4c_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
  });

  afterEach(() => {
    while (activeFakeZaloAccountIds.length) {
      zaloAccountSessionService.clearAccountApi(activeFakeZaloAccountIds.pop());
    }
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

  // ── Fixture Helpers ─────────────────────────────────────────────────────────

  async function setupEmailCampaignFixture() {
    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'Email Matrix Campaign', 'email', 'active') RETURNING id`,
      [user.id]
    );
    const campaignId = cRows[0].id;
    const { rows: rRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
       VALUES ($1, $2, 'manual', 'running') RETURNING id`,
      [campaignId, user.id]
    );
    const runId = rRows[0].id;
    const senderEmail = `camp_sender_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { rows: sRows } = await db.query(
      `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
       VALUES ($1, 'Email Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true)
       RETURNING id`,
      [user.id, senderEmail, encryptSmtpSecret('secret123')]
    );
    return { campaignId, runId, emailSettingId: sRows[0].id };
  }

  function buildEmailActionNode(nodeId, fromEmailId) {
    return {
      id: nodeId,
      config: {
        fromEmailId,
        emailSubject: 'Q4c Matrix Email Subject',
        emailBody: '<p>Q4c Matrix Email Body</p>',
      },
    };
  }

  async function setupZaloCampaignFixture() {
    const { rows: accRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
       VALUES ($1, true, 'connected', 'Zalo Matrix Account') RETURNING id`,
      [user.id]
    );
    const accountId = accRows[0].id;
    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'Zalo Matrix Campaign', 'zalo', 'active') RETURNING id`,
      [user.id]
    );
    const campaignId = cRows[0].id;
    const { rows: rRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
       VALUES ($1, $2, 'manual', 'running') RETURNING id`,
      [campaignId, user.id]
    );
    const runId = rRows[0].id;
    return { accountId, campaignId, runId };
  }

  async function insertZaloPlaceholder({ campaignId, runId, channel, recipientValue, groupId, accountId }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_messages (
         id_campaign, id_run, id_node, channel, recipient_type, recipient_value, group_id,
         account_id, message_text, tracking_token, tracking_metadata, sent_at, created_at, updated_at
       ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'hello', $8, '{"status":"queued"}'::jsonb, NOW(), NOW(), NOW())
       RETURNING id`,
      [
        campaignId, runId, channel, groupId ? 'group' : 'uid', recipientValue || null, groupId || null,
        accountId, `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ]
    );
    return rows[0].id;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // A & B: STALLED-JOB REDELIVERY MATRIX (ĐỦ 4 CAMPAIGN JOB TYPES)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Section A & B — Stalled-Job Redelivery Matrix for 4 Campaign Job Types', () => {

    // ── 1. EMAIL_SEND ──────────────────────────────────────────────────────────
    describe('Job Type: EMAIL_SEND (sendEmailToCustomerDirect)', () => {
      it('replays response snapshot on duplicate call after consumed, without calling provider or creating second reservation/message', async () => {
        const { campaignId, runId, emailSettingId } = await setupEmailCampaignFixture();
        const recipientEmail = `email_redeliver_${Date.now()}@example.com`;
        await db.query(
          `INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, 'Recipient A')`,
          [user.id, recipientEmail]
        );
        const actionNode = buildEmailActionNode('node_email_1', emailSettingId);
        const customer = { email: recipientEmail, full_name: 'Recipient A' };
        const campaign = { id: campaignId, id_user: user.id };

        mockSendMail.mockClear();
        // Lần 1: Thực thi gửi bình thường
        const r1 = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode, customer, campaign, runId, null, { emailStep: 1 }
        );
        expect(r1.status).toBe('success');
        expect(mockSendMail).toHaveBeenCalledTimes(1);

        // Lần 2: Mô phỏng BullMQ stalled-job redelivery (gọi lại cùng handler + payload)
        const r2 = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode, customer, campaign, runId, null, { emailStep: 1 }
        );
        expect(r2.status).toBe('success');
        expect(r2.isReplay).toBe(true);
        expect(mockSendMail).toHaveBeenCalledTimes(1); // Provider KHÔNG được gọi lần 2

        const { rows: reservations } = await db.query(
          'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe('consumed');

        const { rows: messages } = await db.query(
          'SELECT * FROM email_messages WHERE id_run = $1',
          [runId]
        );
        expect(messages).toHaveLength(1); // Không tạo row thứ 2
        expect(messages[0].quota_reservation_id).toBe(reservations[0].id);

        const { rows: debits } = await db.query(
          'SELECT * FROM topup_debits WHERE user_id = $1',
          [user.id]
        );
        expect(debits).toHaveLength(0); // Không tạo topup debit thừa
      });

      it('rejects with 409 CONCURRENT_SEND_IN_PROGRESS when first attempt is still reserved/sending', async () => {
        const { campaignId, runId, emailSettingId } = await setupEmailCampaignFixture();
        const recipientEmail = `email_in_flight_${Date.now()}@example.com`;
        const actionNode = buildEmailActionNode('node_email_flight', emailSettingId);
        const customer = { email: recipientEmail, full_name: 'Recipient In-Flight' };
        const campaign = { id: campaignId, id_user: user.id };

        let concurrentRejected = false;
        mockSendMail.mockImplementationOnce(async () => {
          // Tại thời điểm này, attempt 1 đã reserve và mark sending
          try {
            await campaignEmailSenderService.sendEmailToCustomerDirect(
              actionNode, customer, campaign, runId, null, { emailStep: 1 }
            );
          } catch (err) {
            expect(err.status).toBe(409);
            expect(err.code).toBe('CONCURRENT_SEND_IN_PROGRESS');
            concurrentRejected = true;
          }
          return { messageId: '<test-flight@uknow.test>', accepted: [recipientEmail] };
        });

        await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode, customer, campaign, runId, null, { emailStep: 1 }
        );
        expect(concurrentRejected).toBe(true);
      });

      it('rejects with 409 RESERVATION_UNCERTAIN when prior attempt resulted in uncertain, blocking automatic resend', async () => {
        const { campaignId, runId, emailSettingId } = await setupEmailCampaignFixture();
        const recipientEmail = `email_uncertain_${Date.now()}@example.com`;
        const actionNode = buildEmailActionNode('node_email_unc', emailSettingId);
        const customer = { email: recipientEmail, full_name: 'Recipient Uncertain' };
        const campaign = { id: campaignId, id_user: user.id };

        // Attempt 1: Lỗi timeout/mơ hồ phía provider -> reservation chuyển sang uncertain
        mockSendMail.mockRejectedValueOnce(new Error('Connection timed out'));
        const firstResult = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode, customer, campaign, runId, null, { emailStep: 1 }
        );
        expect(firstResult.status).toBe('failed');

        // Kiểm tra reservation đã thành uncertain
        const { rows: reservations } = await db.query(
          'SELECT status FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations[0].status).toBe('uncertain');

        // Attempt 2 (redelivery khi uncertain): Phải ném 409 RESERVATION_UNCERTAIN
        await expect(
          campaignEmailSenderService.sendEmailToCustomerDirect(
            actionNode, customer, campaign, runId, null, { emailStep: 1 }
          )
        ).rejects.toMatchObject({
          status: 409,
          code: 'RESERVATION_UNCERTAIN',
        });
      });
    });

    // ── 2. ZALO_PERSONAL_SEND ──────────────────────────────────────────────────
    describe('Job Type: ZALO_PERSONAL_SEND (sendPersonalMessageByQueue)', () => {
      it('replays response snapshot on duplicate call after consumed, without second provider call or second message row', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '1001' } });
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_personal', recipientValue: 'uid_pers_1', accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          recipient: 'uid_pers_1',
          recipientType: 'uid',
          quotaRecipientKey: 'uid_pers_1',
          quotaContentKey: 'noi dung goc ca nhan',
          runId,
          nodeId: 10,
          stepIndex: 1,
          zaloMessageId,
          message: 'noi dung da rewrite',
        };

        const r1 = await campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload);
        expect(fakeSendMessage).toHaveBeenCalledTimes(1);
        expect(r1.quotaReservationId).toBeTruthy();

        // Stalled-job redelivery call 2
        const r2 = await campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload);
        expect(r2.isReplay).toBe(true);
        expect(fakeSendMessage).toHaveBeenCalledTimes(1); // Không gọi lại provider

        const { rows: reservations } = await db.query(
          'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe('consumed');

        const { rows: messages } = await db.query(
          'SELECT * FROM zalo_messages WHERE id_run = $1',
          [runId]
        );
        expect(messages).toHaveLength(1);
      });

      it('rejects with 409 CONCURRENT_SEND_IN_PROGRESS when first attempt is still reserved/sending', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const recipientUid = 'uid_pers_flight';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_personal', recipientValue: recipientUid, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          recipient: recipientUid,
          recipientType: 'uid',
          quotaRecipientKey: recipientUid,
          quotaContentKey: 'hello in flight',
          runId,
          nodeId: 11,
          stepIndex: 1,
          zaloMessageId,
          message: 'hello in flight',
        };

        let concurrentRejected = false;
        const fakeSendMessage = jest.fn().mockImplementation(async () => {
          try {
            await campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload);
          } catch (err) {
            expect(err.status).toBe(409);
            expect(err.code).toBe('CONCURRENT_SEND_IN_PROGRESS');
            concurrentRejected = true;
          }
          return { message: { msgId: '10011' } };
        });
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        await campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload);
        expect(concurrentRejected).toBe(true);
      });

      it('rejects with 409 RESERVATION_UNCERTAIN when prior attempt is in uncertain state', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const recipientUid = 'uid_pers_unc';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_personal', recipientValue: recipientUid, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          recipient: recipientUid,
          recipientType: 'uid',
          quotaRecipientKey: recipientUid,
          quotaContentKey: 'hello unc',
          runId,
          nodeId: 12,
          stepIndex: 1,
          zaloMessageId,
          message: 'hello unc',
        };

        const fakeSendMessage = jest.fn().mockRejectedValue(new Error('Zalo server error 500'));
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        // Attempt 1: gặp timeout, reservation thành uncertain
        await expect(campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload)).rejects.toThrow();

        const { rows: reservations } = await db.query(
          'SELECT status FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations[0].status).toBe('uncertain');

        // Attempt 2: replay khi uncertain -> 409 RESERVATION_UNCERTAIN
        await expect(campaignZaloSenderService.sendPersonalMessageByQueue(jobPayload)).rejects.toMatchObject({
          status: 409,
          code: 'RESERVATION_UNCERTAIN',
        });
      });
    });

    // ── 3. ZALO_GROUP_SEND ─────────────────────────────────────────────────────
    describe('Job Type: ZALO_GROUP_SEND (sendGroupMessageByQueue)', () => {
      it('replays response snapshot on duplicate call after consumed, without calling provider twice', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '2001' } });
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_group', groupId: 'group_test_1', accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          groupId: 'group_test_1',
          quotaRecipientKey: 'group_test_1',
          quotaContentKey: 'noi dung nhom goc',
          runId,
          nodeId: 20,
          stepIndex: 1,
          zaloMessageId,
          message: 'noi dung nhom da rewrite',
        };

        const r1 = await campaignZaloSenderService.sendGroupMessageByQueue(jobPayload);
        expect(fakeSendMessage).toHaveBeenCalledTimes(1);
        expect(r1.quotaReservationId).toBeTruthy();

        // Redelivery call 2
        const r2 = await campaignZaloSenderService.sendGroupMessageByQueue(jobPayload);
        expect(r2.isReplay).toBe(true);
        expect(fakeSendMessage).toHaveBeenCalledTimes(1);

        const { rows: reservations } = await db.query(
          'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe('consumed');
      });

      it('rejects with 409 CONCURRENT_SEND_IN_PROGRESS when first attempt is still in-flight', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const groupId = 'group_in_flight';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_group', groupId, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          groupId,
          quotaRecipientKey: groupId,
          quotaContentKey: 'group in flight',
          runId,
          nodeId: 21,
          stepIndex: 1,
          zaloMessageId,
          message: 'group in flight',
        };

        let concurrentRejected = false;
        const fakeSendMessage = jest.fn().mockImplementation(async () => {
          try {
            await campaignZaloSenderService.sendGroupMessageByQueue(jobPayload);
          } catch (err) {
            expect(err.status).toBe(409);
            expect(err.code).toBe('CONCURRENT_SEND_IN_PROGRESS');
            concurrentRejected = true;
          }
          return { message: { msgId: '20011' } };
        });
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        await campaignZaloSenderService.sendGroupMessageByQueue(jobPayload);
        expect(concurrentRejected).toBe(true);
      });

      it('rejects with 409 RESERVATION_UNCERTAIN when prior group send is in uncertain state', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const groupId = 'group_uncertain';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_group', groupId, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          groupId,
          quotaRecipientKey: groupId,
          quotaContentKey: 'group msg unc',
          runId,
          nodeId: 22,
          stepIndex: 1,
          zaloMessageId,
          message: 'group msg unc',
        };

        const fakeSendMessage = jest.fn().mockRejectedValue(new Error('Zalo server error 500'));
        zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
        activeFakeZaloAccountIds.push(accountId);

        await expect(campaignZaloSenderService.sendGroupMessageByQueue(jobPayload)).rejects.toThrow();

        const { rows: reservations } = await db.query(
          'SELECT status FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations[0].status).toBe('uncertain');

        await expect(campaignZaloSenderService.sendGroupMessageByQueue(jobPayload)).rejects.toMatchObject({
          status: 409,
          code: 'RESERVATION_UNCERTAIN',
        });
      });
    });

    // ── 4. ZALO_FRIEND_REQUEST_SEND ────────────────────────────────────────────
    describe('Job Type: ZALO_FRIEND_REQUEST_SEND (sendFriendRequestByQueue)', () => {
      it('replays response snapshot on duplicate call after consumed, without second provider call', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const fakeFindUser = jest.fn().mockResolvedValue({ uid: 'uid_friend_q4c', zalo_display: 'Friend Q4c' });
        const fakeSendFriendRequest = jest.fn().mockResolvedValue({ ok: true });
        zaloAccountSessionService.setAccountApi(accountId, { findUser: fakeFindUser, sendFriendRequest: fakeSendFriendRequest });
        activeFakeZaloAccountIds.push(accountId);

        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_friend_request', recipientValue: '0988776655', accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          phone: '0988776655',
          quotaRecipientKey: '0988776655',
          quotaContentKey: 'Ket ban nhe Q4c',
          runId,
          nodeId: 30,
          stepIndex: 1,
          zaloMessageId,
          message: 'Ket ban nhe Q4c',
        };

        const r1 = await campaignZaloSenderService.sendFriendRequestByQueue(jobPayload);
        expect(fakeSendFriendRequest).toHaveBeenCalledTimes(1);
        expect(r1.quotaReservationId).toBeTruthy();

        // Redelivery call 2
        const r2 = await campaignZaloSenderService.sendFriendRequestByQueue(jobPayload);
        expect(r2.isReplay).toBe(true);
        expect(fakeSendFriendRequest).toHaveBeenCalledTimes(1); // Không gọi lại

        const { rows: reservations } = await db.query(
          'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe('consumed');
      });

      it('rejects with 409 CONCURRENT_SEND_IN_PROGRESS when first attempt is still in-flight', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const phone = '0911223344';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_friend_request', recipientValue: phone, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          phone,
          quotaRecipientKey: phone,
          quotaContentKey: 'Ket ban in flight',
          runId,
          nodeId: 31,
          stepIndex: 1,
          zaloMessageId,
          message: 'Ket ban in flight',
        };

        let concurrentRejected = false;
        const fakeFindUser = jest.fn().mockResolvedValue({ uid: 'uid_friend_flight' });
        const fakeSendFriendRequest = jest.fn().mockImplementation(async () => {
          try {
            await campaignZaloSenderService.sendFriendRequestByQueue(jobPayload);
          } catch (err) {
            expect(err.status).toBe(409);
            expect(err.code).toBe('CONCURRENT_SEND_IN_PROGRESS');
            concurrentRejected = true;
          }
          return { ok: true };
        });
        zaloAccountSessionService.setAccountApi(accountId, { findUser: fakeFindUser, sendFriendRequest: fakeSendFriendRequest });
        activeFakeZaloAccountIds.push(accountId);

        await campaignZaloSenderService.sendFriendRequestByQueue(jobPayload);
        expect(concurrentRejected).toBe(true);
      });

      it('rejects with 409 RESERVATION_UNCERTAIN when prior friend request is in uncertain state', async () => {
        const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
        const phone = '0922334455';
        const zaloMessageId = await insertZaloPlaceholder({
          campaignId, runId, channel: 'zalo_friend_request', recipientValue: phone, accountId,
        });
        const jobPayload = {
          userId: user.id,
          accountId,
          phone,
          quotaRecipientKey: phone,
          quotaContentKey: 'Ket ban unc',
          runId,
          nodeId: 32,
          stepIndex: 1,
          zaloMessageId,
          message: 'Ket ban unc',
        };

        const fakeFindUser = jest.fn().mockResolvedValue({ uid: 'uid_friend_unc' });
        const fakeSendFriendRequest = jest.fn().mockRejectedValue(new Error('Zalo server error 500'));
        zaloAccountSessionService.setAccountApi(accountId, { findUser: fakeFindUser, sendFriendRequest: fakeSendFriendRequest });
        activeFakeZaloAccountIds.push(accountId);

        await expect(campaignZaloSenderService.sendFriendRequestByQueue(jobPayload)).rejects.toThrow();

        const { rows: reservations } = await db.query(
          'SELECT status FROM send_quota_reservations WHERE billing_user_id = $1',
          [user.id]
        );
        expect(reservations[0].status).toBe('uncertain');

        await expect(campaignZaloSenderService.sendFriendRequestByQueue(jobPayload)).rejects.toMatchObject({
          status: 409,
          code: 'RESERVATION_UNCERTAIN',
        });
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // C: RECONCILIATION OBSERVATION HOOK KHI RESUME CAMPAIGN RUN
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Section C — Reconciliation Observation Hook on Campaign Run Resume', () => {
    it('findStaleCampaignRunReservations locates past-lease reserved/sending and uncertain rows belonging to runId without state mutation', async () => {
      const runId = 55501;
      const now = new Date();

      // 1. Reserved quá lease (expires_at in the past)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, created_at, updated_at
         ) VALUES (
           'campaign:55501:n1:email:h1:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'email', 1, true, 'campaign_email', '{"runId":55501,"nodeId":1}'::jsonb,
           'reserved', NOW(), NOW() + interval '1 day', NOW() - interval '10 minutes', NOW() - interval '20 minutes', NOW()
         )`,
        [user.id]
      );

      // 2. Sending quá stale duration
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, sending_at, created_at, updated_at
         ) VALUES (
           'campaign:55501:n2:zalo:h2:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'zalo', 1, true, 'campaign_zalo', '{"runId":"55501","nodeId":2}'::jsonb,
           'sending', NOW(), NOW() + interval '1 day', NOW() + interval '100 seconds', NOW() - interval '15 minutes', NOW() - interval '15 minutes', NOW()
         )`,
        [user.id]
      );

      // 3. Uncertain thuộc run
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, uncertain_at, created_at, updated_at
         ) VALUES (
           'campaign:55501:n3:zalo:h3:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'zalo', 1, true, 'campaign_zalo', '{"runId":55501,"nodeId":3}'::jsonb,
           'uncertain', NOW(), NOW() + interval '1 day', NOW() + interval '300 seconds', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
         )`,
        [user.id]
      );

      // 4. Control: Consumed (quá hạn expires nhưng đã hoàn tất -> KHÔNG được lấy)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, consumed_at, created_at, updated_at
         ) VALUES (
           'campaign:55501:n4:email:h4:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'email', 1, true, 'campaign_email', '{"runId":55501,"nodeId":4}'::jsonb,
           'consumed', NOW(), NOW() + interval '1 day', NOW() - interval '5 minutes', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
         )`,
        [user.id]
      );

      // 5. Control: Reserved chưa hết hạn (chưa quá lease -> KHÔNG được lấy)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, created_at, updated_at
         ) VALUES (
           'campaign:55501:n5:email:h5:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'email', 1, true, 'campaign_email', '{"runId":55501,"nodeId":5}'::jsonb,
           'reserved', NOW(), NOW() + interval '1 day', NOW() + interval '20 minutes', NOW(), NOW()
         )`,
        [user.id]
      );

      // 6. Control: RunId khác (KHÔNG được lấy)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, created_at, updated_at
         ) VALUES (
           'campaign:55502:n1:email:h1:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'email', 1, true, 'campaign_email', '{"runId":55502,"nodeId":1}'::jsonb,
           'reserved', NOW(), NOW() + interval '1 day', NOW() - interval '10 minutes', NOW() - interval '20 minutes', NOW()
         )`,
        [user.id]
      );

      const stale = await findStaleCampaignRunReservations(db, { runId, now });
      expect(stale.rows).toHaveLength(3);
      expect(stale.totalCount).toBe(3);
      expect(stale.hasMore).toBe(false);

      const statuses = stale.rows.map((r) => r.status).sort();
      expect(statuses).toEqual(['reserved', 'sending', 'uncertain']);

      // Khẳng định Zero PII trong output
      for (const row of stale.rows) {
        expect(row).toHaveProperty('id');
        expect(row).toHaveProperty('status');
        expect(row).toHaveProperty('source_type');
        expect(row).toHaveProperty('age_seconds');
        expect(row.age_seconds).toBeGreaterThanOrEqual(0);
        // Không chứa thông tin PII khách hàng
        expect(row).not.toHaveProperty('email');
        expect(row).not.toHaveProperty('phone');
        expect(row).not.toHaveProperty('recipient');
      }

      // Khẳng định KHÔNG mutate dữ liệu (trạng thái giữ nguyên)
      const { rows: verifyRows } = await db.query(
        `SELECT status FROM send_quota_reservations WHERE id = ANY($1::bigint[])`,
        [stale.rows.map((r) => r.id)]
      );
      const verifiedStatuses = verifyRows.map((r) => r.status).sort();
      expect(verifiedStatuses).toEqual(['reserved', 'sending', 'uncertain']);
    });

    it('findStaleCampaignRunReservations returns totalCount and hasMore=true when backlog exceeds limit (backlog visibility)', async () => {
      const runId = 55599;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Tạo 5 reservation uncertain thuộc runId 55599
      for (let i = 1; i <= 5; i += 1) {
        await db.query(
          `INSERT INTO send_quota_reservations (
             reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
             source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, uncertain_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, 'email', 1, true, 'campaign_email', $4::jsonb,
             'uncertain', NOW(), NOW() + interval '1 day', NOW() + interval '100 seconds', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
           )`,
          [
            `campaign:55599:n1:email:backlog:${i}`,
            `${'a'.repeat(60)}${String(i).padStart(4, '0')}`,
            user.id,
            JSON.stringify({ runId: 55599, nodeId: 1 }),
          ]
        );
      }

      // 1. Kiểm tra qua repository: limit=2, tổng 5 bản ghi -> rows=2, totalCount=5, hasMore=true
      const sample = await findStaleCampaignRunReservations(db, { runId, limit: 2 });
      expect(sample.rows).toHaveLength(2);
      expect(sample.totalCount).toBe(5);
      expect(sample.hasMore).toBe(true);

      // 2. Kiểm tra qua observation hook: log cảnh báo phải báo đúng totalStalledCount=5, sampleCount=2, hasMore=true
      const hookResult = await campaignRunService.observeStaleReservationsOnRunResume(runId, { limit: 2 });
      expect(hookResult.rows).toHaveLength(2);
      expect(hookResult.totalCount).toBe(5);
      expect(hookResult.hasMore).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const loggedMeta = warnSpy.mock.calls[0][1];
      expect(loggedMeta.runId).toBe(runId);
      expect(loggedMeta.totalStalledCount).toBe(5);
      expect(loggedMeta.sampleCount).toBe(2);
      expect(loggedMeta.hasMore).toBe(true);

      warnSpy.mockRestore();
    });

    it('observeStaleReservationsOnRunResume only runs when resume signal is present (manual/scheduler resume), not on fresh runs', async () => {
      const observeSpy = jest.spyOn(campaignRunService, 'observeStaleReservationsOnRunResume');
      const { campaignId, runId, emailSettingId } = await setupEmailCampaignFixture();

      // Thêm node send_email đơn giản vào campaign
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails: 'fresh_run_test@example.com',
            fromEmailId: emailSettingId,
            emailSubject: 'Fresh Run Subject',
            emailBody: '<p>Body</p>',
          }),
        ]
      );

      // 1. Fresh run (không có cờ isResume hay resumedBy) -> KHÔNG gọi observeStaleReservationsOnRunResume
      observeSpy.mockClear();
      await campaignRunService.executeCampaign(campaignId, runId, user.id);
      expect(observeSpy).not.toHaveBeenCalled();

      // 2. Resumed run (ví dụ scheduler recovery với resumedBy: 'per_minute' hoặc manual resume) -> CÓ gọi observeStaleReservationsOnRunResume
      observeSpy.mockClear();
      await campaignRunService.executeCampaign(campaignId, runId, user.id, null, {
        isResume: true,
        resumedBy: 'per_minute',
      });
      expect(observeSpy).toHaveBeenCalledTimes(1);
      expect(observeSpy).toHaveBeenCalledWith(runId);

      observeSpy.mockRestore();
    });

    it('observeStaleReservationsOnRunResume logs structured non-PII warning when stale rows found, and stays silent when empty', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const runId = 77701;

      // Khi không có bản ghi nào: không tạo log nhiễu
      const emptyResult = await campaignRunService.observeStaleReservationsOnRunResume(runId);
      expect(emptyResult.rows).toHaveLength(0);
      expect(emptyResult.totalCount).toBe(0);
      expect(emptyResult.hasMore).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();

      // Thêm 1 bản ghi reserved quá lease
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, created_at, updated_at
         ) VALUES (
           'campaign:77701:n1:email:h1:1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
           $1, 'email', 1, true, 'campaign_email', '{"runId":77701,"nodeId":1}'::jsonb,
           'reserved', NOW(), NOW() + interval '1 day', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
         )`,
        [user.id]
      );

      const foundResult = await campaignRunService.observeStaleReservationsOnRunResume(runId);
      expect(foundResult.rows).toHaveLength(1);
      expect(foundResult.totalCount).toBe(1);
      expect(foundResult.hasMore).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const loggedMeta = warnSpy.mock.calls[0][1];
      expect(loggedMeta.runId).toBe(runId);
      expect(loggedMeta.totalStalledCount).toBe(1);
      expect(loggedMeta.sampleCount).toBe(1);
      expect(loggedMeta.hasMore).toBe(false);
      expect(loggedMeta.reservations[0]).toMatchObject({
        reservationId: foundResult.rows[0].id,
        sourceType: 'campaign_email',
        status: 'reserved',
      });
      // Zero-PII: không log recipient hoặc reservation_key
      expect(loggedMeta.reservations[0]).not.toHaveProperty('recipient');
      expect(loggedMeta.reservations[0]).not.toHaveProperty('reservationKey');

      warnSpy.mockRestore();
    });

    it('observeStaleReservationsOnRunResume scans both current run and source run when resumeFromRunId is present', async () => {
      const oldRunId = 66601;
      const { campaignId, runId: newRunId, emailSettingId } = await setupEmailCampaignFixture();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // 1. Seed stale reservation ở oldRunId (source run)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, uncertain_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'email', 1, true, 'campaign_email', $4::jsonb,
           'uncertain', NOW(), NOW() + interval '1 day', NOW() + interval '100 seconds', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
         )`,
        [
          `campaign:66601:n1:email:source-stale`,
          'b'.repeat(64),
          user.id,
          JSON.stringify({ runId: oldRunId, nodeId: 1 }),
        ]
      );

      // 2. Thêm node send_email và cập nhật run_metadata có resumeFromRunId
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails: 'resume_source_test@example.com',
            fromEmailId: emailSettingId,
            emailSubject: 'Resume Source Test',
            emailBody: '<p>Body</p>',
          }),
        ]
      );

      await db.query(
        `UPDATE campaign_runs SET run_metadata = $1::jsonb WHERE id = $2`,
        [JSON.stringify({ source: 'campaign_run', resumeFromRunId: oldRunId }), newRunId]
      );

      // 3. Thực thi qua CampaignRun orchestration
      await campaignRunService.executeCampaign(campaignId, newRunId, user.id, null, {
        isResume: true,
        resumeFromRunId: oldRunId,
      });

      // 4. Khẳng định hook quét và log cả lượt chạy nguồn (oldRunId)
      const warningLogs = warnSpy.mock.calls
        .map((call) => call[1])
        .filter((meta) => meta && (meta.runId === oldRunId || meta.runId === newRunId));

      const oldRunLog = warningLogs.find((meta) => meta.runId === oldRunId);
      expect(oldRunLog).toBeDefined();
      expect(oldRunLog.totalStalledCount).toBeGreaterThanOrEqual(1);
      expect(oldRunLog.isSourceRun).toBe(true);

      warnSpy.mockRestore();
    });

    it('observeStaleReservationsOnRunResume scans source run when resumeFromRunId is provided via executionOptions only', async () => {
      const oldRunId = 66602;
      const { campaignId, runId: newRunId, emailSettingId } = await setupEmailCampaignFixture();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // 1. Seed stale reservation ở oldRunId (source run)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, uncertain_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'email', 1, true, 'campaign_email', $4::jsonb,
           'uncertain', NOW(), NOW() + interval '1 day', NOW() + interval '100 seconds', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW()
         )`,
        [
          `campaign:66602:n1:email:source-stale-option-only`,
          'c'.repeat(64),
          user.id,
          JSON.stringify({ runId: oldRunId, nodeId: 1 }),
        ]
      );

      // 2. Thêm node send_email
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email Option Only', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails: 'resume_option_only_test@example.com',
            fromEmailId: emailSettingId,
            emailSubject: 'Resume Option Only Test',
            emailBody: '<p>Body</p>',
          }),
        ]
      );

      // Đảm bảo run_metadata trong DB KHÔNG có resumeFromRunId
      await db.query(
        `UPDATE campaign_runs SET run_metadata = '{}'::jsonb WHERE id = $1`,
        [newRunId]
      );

      // 3. Thực thi chỉ truyền resumeFromRunId qua executionOptions
      await campaignRunService.executeCampaign(campaignId, newRunId, user.id, null, {
        isResume: true,
        resumeFromRunId: oldRunId,
      });

      // 4. Khẳng định hook fallback quét được source run từ executionOptions
      const warningLogs = warnSpy.mock.calls
        .map((call) => call[1])
        .filter((meta) => meta && (meta.runId === oldRunId || meta.runId === newRunId));

      const oldRunLog = warningLogs.find((meta) => meta.runId === oldRunId);
      expect(oldRunLog).toBeDefined();
      expect(oldRunLog.totalStalledCount).toBeGreaterThanOrEqual(1);
      expect(oldRunLog.isSourceRun).toBe(true);

      warnSpy.mockRestore();
    });

    it('findStaleCampaignRunReservations respects default 300s threshold and override threshold', async () => {
      const runId = 88801;
      const now = new Date();

      // Seed 1 reservation in 'sending' state created 200s ago (stale if 120s, but NOT stale under default 300s contract)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, sending_at, created_at, updated_at
         ) VALUES (
           'campaign:88801:n1:email:sending:1', '${'c'.repeat(64)}',
           $1, 'email', 1, true, 'campaign_email', '{"runId":88801,"nodeId":1}'::jsonb,
           'sending', NOW(), NOW() + interval '1 day', NOW() - interval '200 seconds', NOW() - interval '200 seconds', NOW()
         )`,
        [user.id]
      );

      // 1. Mặc định 300s: 200s < 300s -> KHÔNG coi là stale
      const defaultCheck = await findStaleCampaignRunReservations(db, { runId, now });
      expect(defaultCheck.rows).toHaveLength(0);
      expect(defaultCheck.totalCount).toBe(0);

      // 2. Override staleSendingSeconds: 150s -> 200s > 150s -> PHÁT HIỆN stale
      const overrideCheck = await findStaleCampaignRunReservations(db, { runId, now, staleSendingSeconds: 150 });
      expect(overrideCheck.rows).toHaveLength(1);
      expect(overrideCheck.totalCount).toBe(1);
      expect(overrideCheck.rows[0].status).toBe('sending');
    });

    it('findStaleCampaignRunReservations captures reserved rows with expires_at IS NULL as stale leases', async () => {
      const runId = 88802;
      const now = new Date();

      // Seed 1 reservation with status='reserved' but expires_at IS NULL (unbounded lease leak)
      await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, channel, quantity, is_metered,
           source_type, source_ref, status, vn_day_start, vn_day_end, expires_at, created_at, updated_at
         ) VALUES (
           'campaign:88802:n1:email:reserved:null', '${'d'.repeat(64)}',
           $1, 'email', 1, true, 'campaign_email', '{"runId":88802,"nodeId":1}'::jsonb,
           'reserved', NOW(), NOW() + interval '1 day', NULL, NOW() - interval '1 hour', NOW()
         )`,
        [user.id]
      );

      const res = await findStaleCampaignRunReservations(db, { runId, now });
      expect(res.totalCount).toBe(1);
      expect(res.rows[0].status).toBe('reserved');
      expect(res.rows[0].expires_at).toBeNull();
    });

    it('observeStaleReservationsOnRunResume runs early even when run is deferred until the future', async () => {
      const observeSpy = jest.spyOn(campaignRunService, 'observeStaleReservationsOnRunResume');
      const { campaignId, runId } = await setupEmailCampaignFixture();

      // Cấu hình defer mốc tương lai xa (1 giờ sau)
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      await db.query(
        `UPDATE campaign_runs
         SET run_metadata = jsonb_build_object('nonContinuousDeferredUntil', $1::text)
         WHERE id = $2`,
        [futureDate, runId]
      );

      // Chạy với cờ isResume: true
      observeSpy.mockClear();
      await campaignRunService.executeCampaign(campaignId, runId, user.id, null, {
        isResume: true,
      });

      // Khẳng định: hook quan sát đã được gọi trước khi exit do defer
      expect(observeSpy).toHaveBeenCalledTimes(1);
      expect(observeSpy).toHaveBeenCalledWith(runId);

      observeSpy.mockRestore();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // D: OWNER CONTEXT, EMPLOYEE ACTOR & NO ADMIN BYPASS (REAL ORCHESTRATION)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Section D — Metering Context, Employee Actor & No Admin Bypass in Campaign Orchestration', () => {
    it('employee actor in campaign orchestration: quota is billed to workspace owner, is_metered=true', async () => {
      // 1. Tạo employee và gán membership thuộc owner user
      const employee = await createUser({
        email: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      });
      await db.query(
        `INSERT INTO user_members (owner_id, employee_id, status, created_at, updated_at)
         VALUES ($1, $2, 'active', NOW(), NOW())`,
        [user.id, employee.id]
      );

      // 2. Tạo plan cho workspace owner
      const plan = await createPlan({ dailyEmailLimit: 10, monthlyEmailLimit: 100 });
      await assignPlanToUser(user.id, plan.id);

      // 3. Tạo email sender setting cho workspace owner
      const senderEmail = `owner_sender_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
      const { rows: sRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Owner Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true)
         RETURNING id`,
        [user.id, senderEmail, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = sRows[0].id;

      // 4. Tạo campaign của workspace owner
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
         VALUES ($1, $1, 'Employee Triggered Campaign', 'email', 'active') RETURNING id`,
        [user.id]
      );
      const campaignId = cRows[0].id;

      const recipientEmail = `emp_orchestration_${Date.now()}@example.com`;
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails: recipientEmail,
            fromEmailId: emailSettingId,
            emailSubject: 'Employee Test Subject',
            emailBody: '<p>Employee Test Body</p>',
          }),
        ]
      );

      // 5. Tạo campaign run record do employee trigger
      const { rows: rRows } = await db.query(
        `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, triggered_by, run_type, status, run_metadata)
         VALUES ($1, $2, $3, 'manual', 'running', $4) RETURNING id`,
        [
          campaignId,
          user.id,
          employee.id,
          JSON.stringify({ source: 'campaign_run', roleCode: 'employee' }),
        ]
      );
      const runId = rRows[0].id;

      const consoleErrorSpy = jest.spyOn(console, 'error');

      // 6. Thực thi qua CampaignRun orchestration thật với roleCode='employee', userId=workspace owner
      await campaignRunService.executeCampaign(campaignId, runId, user.id, 'employee');

      // 7. Khẳng định: Run kết thúc hoàn tất thành công (không bị failRun do 42P10)
      const { rows: runRows } = await db.query(
        'SELECT status, error_message, successful_sends, failed_sends FROM campaign_runs WHERE id = $1',
        [runId]
      );
      expect(runRows[0].status).toBe('completed');
      expect(runRows[0].error_message).toBeNull();
      expect(Number(runRows[0].successful_sends)).toBe(1);
      expect(Number(runRows[0].failed_sends)).toBe(0);

      // Khẳng định: ledger row (campaign_run_recipient_steps) được ghi nhận thành công
      const { rows: stepRows } = await db.query(
        'SELECT * FROM campaign_run_recipient_steps WHERE id_run = $1',
        [runId]
      );
      expect(stepRows).toHaveLength(1);
      expect(stepRows[0].is_fully_completed).toBe(true);
      expect(stepRows[0].recipient_key).toBe(recipientEmail);

      // Khẳng định không xuất hiện lỗi 42P10 trong console.error
      const calls42P10 = consoleErrorSpy.mock.calls.filter((args) =>
        args.some((a) => String(a?.message || a).includes('42P10'))
      );
      expect(calls42P10).toHaveLength(0);

      // 8. Kiểm tra trực tiếp DB: billing_user_id là workspace owner, is_metered=true, status=consumed
      const { rows: reservations } = await db.query(
        "SELECT billing_user_id, is_metered, status FROM send_quota_reservations WHERE source_ref->>'runId' = $1",
        [String(runId)]
      );
      expect(reservations).toHaveLength(1);
      expect(Number(reservations[0].billing_user_id)).toBe(Number(user.id)); // Workspace Owner
      expect(reservations[0].is_metered).toBe(true);
      expect(reservations[0].status).toBe('consumed');

      consoleErrorSpy.mockRestore();
    });

    it('admin actor triggering campaign run orchestration: no admin-bypass, owner quota limits strictly apply', async () => {
      // 1. Tạo admin user với role='admin'
      const admin = await createUser({
        email: `admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
        role: 'admin',
      });

      // 2. Thiết lập workspace owner có dailyLimit = 0 (hết hạn mức)
      const limitedPlan = await createPlan({ dailyEmailLimit: 0, monthlyEmailLimit: 100 });
      await assignPlanToUser(user.id, limitedPlan.id);

      // 3. Tạo email sender setting cho workspace owner
      const senderEmail = `owner_sender_ltd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
      const { rows: sRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'Owner Sender Limited', $2, 'smtp.example.com', 465, $2, $3, 'active', true)
         RETURNING id`,
        [user.id, senderEmail, encryptSmtpSecret('secret123')]
      );
      const emailSettingId = sRows[0].id;

      // 4. Tạo campaign của workspace owner
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
         VALUES ($1, $1, 'Admin Triggered Campaign', 'email', 'active') RETURNING id`,
        [user.id]
      );
      const campaignId = cRows[0].id;

      const recipientEmail = `admin_target_${Date.now()}@example.com`;
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, 1)`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails: recipientEmail,
            fromEmailId: emailSettingId,
            emailSubject: 'Admin Test Subject',
            emailBody: '<p>Admin Test Body</p>',
          }),
        ]
      );

      // 5. Tạo campaign run record do admin trigger
      const { rows: rRows } = await db.query(
        `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, triggered_by, run_type, status, run_metadata)
         VALUES ($1, $2, $3, 'manual', 'running', $4) RETURNING id`,
        [
          campaignId,
          user.id,
          admin.id,
          JSON.stringify({ source: 'campaign_run', roleCode: 'admin' }),
        ]
      );
      const runId = rRows[0].id;

      // Spy sendRawEmail trên campaignEmailSenderService để chứng minh SMTP provider KHÔNG được gọi
      const sendRawEmailSpy = jest.spyOn(campaignEmailSenderService, 'sendRawEmail');
      const consoleErrorSpy = jest.spyOn(console, 'error');

      // 6. Thực thi qua CampaignRun orchestration thật với roleCode='admin', userId=workspace owner
      // Quota pre-check assertSendQuotaOrYield và reserveSendQuota không cho phép admin bypass
      // Bỏ try/catch: nếu có lỗi bất ngờ, test sẽ fail ngay lập tức
      await campaignRunService.executeCampaign(campaignId, runId, user.id, 'admin');

      // 7. Khẳng định: SMTP provider KHÔNG được gọi
      expect(sendRawEmailSpy).not.toHaveBeenCalled();

      // Khẳng định: Không có lỗi 42P10
      const calls42P10 = consoleErrorSpy.mock.calls.filter((args) =>
        args.some((a) => String(a?.message || a).includes('42P10'))
      );
      expect(calls42P10).toHaveLength(0);

      // Khẳng định: Run kết thúc với status='completed', successful_sends=0, failed_sends=1, error_message=null
      const { rows: runRows } = await db.query(
        'SELECT status, error_message, successful_sends, failed_sends, run_metadata FROM campaign_runs WHERE id = $1',
        [runId]
      );
      expect(runRows[0].status).toBe('completed');
      expect(Number(runRows[0].successful_sends)).toBe(0);
      expect(Number(runRows[0].failed_sends)).toBe(1);
      expect(runRows[0].error_message).toBeNull();

      // Kiểm tra execution log ghi nhận lý do dừng chính xác là plan_send_limit_exceeded / disabled
      const { rows: execLogs } = await db.query(
        'SELECT * FROM campaign_executions WHERE id_campaign = $1 AND id_run = $2',
        [campaignId, runId]
      );
      expect(execLogs.length).toBeGreaterThanOrEqual(1);
      const failedItem = execLogs[0]?.execution_data?.items?.[0];
      expect(failedItem).toBeDefined();
      expect(failedItem.status).toBe('failed');
      expect(failedItem.errorType).toBe('plan_send_limit_exceeded');
      expect(failedItem.limitType).toBe('disabled');
      expect(failedItem.error).toContain('không được hỗ trợ trong gói');

      // Khẳng định: không có bất kỳ reservation nào được bypass thành công (status='consumed')
      const { rows: consumedReservations } = await db.query(
        "SELECT * FROM send_quota_reservations WHERE billing_user_id = $1 AND status = 'consumed'",
        [user.id]
      );
      expect(consumedReservations).toHaveLength(0);

      // Nếu có bất kỳ reservation nào thuộc run, is_metered vẫn phải = true và tính cho owner
      const { rows: allReservations } = await db.query(
        "SELECT * FROM send_quota_reservations WHERE billing_user_id = $1",
        [user.id]
      );
      for (const resv of allReservations) {
        expect(resv.is_metered).toBe(true);
        expect(Number(resv.billing_user_id)).toBe(Number(user.id));
      }

      sendRawEmailSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // D: PROVIDER OUTCOMES & LIFECYCLE SEMANTICS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Section D — Provider Outcome Semantics (Success, Definitive No-Send, Ambiguous, Hard Bounce)', () => {
    it('definitive no-send on Zalo friend request (already friends): reservation cleanly released', async () => {
      const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
      const fakeFindUser = jest.fn().mockResolvedValue({ uid: 'uid_friend_done', zalo_display: 'Friend Done' });
      // Giả lập lỗi Zalo thuộc definitive_no_send: người dùng chặn nhận tin nhắn
      const fakeSendFriendRequest = jest.fn().mockRejectedValue(new Error('Người dùng chặn không nhận tin nhắn'));
      zaloAccountSessionService.setAccountApi(accountId, { findUser: fakeFindUser, sendFriendRequest: fakeSendFriendRequest });
      activeFakeZaloAccountIds.push(accountId);

      const zaloMessageId = await insertZaloPlaceholder({
        campaignId, runId, channel: 'zalo_friend_request', recipientValue: '0977112233', accountId,
      });

      await expect(
        campaignZaloSenderService.sendFriendRequestByQueue({
          userId: user.id,
          accountId,
          phone: '0977112233',
          quotaRecipientKey: '0977112233',
          quotaContentKey: 'Ket ban',
          runId,
          nodeId: 40,
          stepIndex: 1,
          zaloMessageId,
          message: 'Ket ban',
        })
      ).rejects.toThrow();

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations).toHaveLength(1);
      expect(reservations[0].status).toBe('released');
    });

    it('ambiguous partial delivery on Zalo group send: reservation marked uncertain', async () => {
      const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
      // Giả lập partial delivery: text gửi thành công có msgId, nhưng attachment không trả msgId
      const fakeSendMessage = jest.fn().mockResolvedValue({
        message: { msgId: '10001' },
        attachment: [],
      });
      zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
      activeFakeZaloAccountIds.push(accountId);

      const zaloMessageId = await insertZaloPlaceholder({
        campaignId, runId, channel: 'zalo_group', groupId: 'group_partial', accountId,
      });

      const sendResult = await campaignZaloSenderService.sendGroupMessageByQueue({
        userId: user.id,
        accountId,
        groupId: 'group_partial',
        quotaRecipientKey: 'group_partial',
        quotaContentKey: 'nhom partial',
        runId,
        nodeId: 41,
        stepIndex: 1,
        zaloMessageId,
        message: 'nhom partial',
        attachments: [{ data: Buffer.from('sample pdf content'), filename: 'report.pdf' }],
      });

      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations).toHaveLength(1);
      expect(reservations[0].status).toBe('uncertain');
      expect(reservations[0].failure_code).toBe('PARTIAL_DELIVERY');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // D: LEGACY MODE OFF & SHADOW PARITY
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Section D — Mode Off & Shadow Parity for Campaign Sends', () => {
    it('mode off: executes send successfully without writing rows to send_quota_reservations', async () => {
      process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
      const { campaignId, runId, emailSettingId } = await setupEmailCampaignFixture();
      const recipientEmail = `mode_off_${Date.now()}@example.com`;
      const actionNode = buildEmailActionNode('node_mode_off', emailSettingId);
      const customer = { email: recipientEmail, full_name: 'Mode Off Customer' };
      const campaign = { id: campaignId, id_user: user.id };

      const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
        actionNode, customer, campaign, runId, null, { emailStep: 1 }
      );
      expect(result.status).toBe('success');

      // Chế độ off không ghi nhận reservation nào
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations).toHaveLength(0);
    });

    it('mode shadow: non-blocking evaluation succeeds without holding atomic quota state', async () => {
      process.env.SEND_QUOTA_RESERVATION_MODE = 'shadow';
      const { accountId, campaignId, runId } = await setupZaloCampaignFixture();
      const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '991001' } });
      zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
      activeFakeZaloAccountIds.push(accountId);

      const sendResult = await campaignZaloSenderService.sendPersonalMessageByQueue({
        userId: user.id,
        accountId,
        recipient: 'uid_shadow_1',
        recipientType: 'uid',
        quotaRecipientKey: 'uid_shadow_1',
        quotaContentKey: 'shadow content',
        runId,
        nodeId: 50,
        stepIndex: 1,
        message: 'shadow content',
      });
      expect(sendResult).toBeTruthy();
      expect(fakeSendMessage).toHaveBeenCalledTimes(1);

      // Chế độ shadow không lưu reservation atomic (chỉ đánh giá sandbox)
      const { rows: reservations } = await db.query(
        'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
        [user.id]
      );
      expect(reservations).toHaveLength(0);
    });
  });
});
