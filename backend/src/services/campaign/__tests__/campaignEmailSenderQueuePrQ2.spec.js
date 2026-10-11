/**
 * PLAN_RA_SOAT_DOT3 PR-Q2 — phía campaignEmailSender.service.js:
 *  - việc a/e: job BullMQ mang jobKey = đúng khoá giữ chỗ quota, payload.campaign chỉ còn 4 trường dùng thật;
 *  - việc g: mọi email chiến dịch có List-Unsubscribe (+ List-Unsubscribe-Post khi HTTPS), URL trùng link trong chân thư.
 * Khuôn mock lấy từ campaignEmailSenderSuppressionPrQ1.spec.js.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
  _clearQuotaCache: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const FAKE_TX_CLIENT = { query: jest.fn() };
const mockReserveSendQuota = jest.fn();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  releaseSendQuota: jest.fn().mockResolvedValue(),
  markSendQuotaSending: jest.fn().mockResolvedValue(),
  consumeSendQuota: jest.fn(async ({ persistSource }) => {
    if (typeof persistSource === 'function') await persistSource(FAKE_TX_CLIENT);
  }),
  markSendQuotaUncertain: jest.fn().mockResolvedValue(),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: outboundMessageQueueService, OUTBOUND_MESSAGE_JOB_TYPES } = await import('../../queue/outboundMessageQueue.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: emailSettingsSmtpService } = await import('../../email/emailSettingsSmtp.service.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');
const { default: emailSuppressionRepository } = await import('../../../repositories/email/emailSuppression.repository.js');
const { buildCampaignReservationKey } = await import('../../quota/sendQuotaKey.service.js');

const actionNode = {
  id: 'node_send_email_q2',
  config: { fromEmailId: 10, emailSubject: 'Thông báo', emailBody: '<p>Nội dung kiểm tra</p>' },
};
const customer = { email: 'Khach.Q2@Example.com', full_name: 'Khach Q2' };
const bigCampaign = {
  id: 811,
  id_user: 39,
  created_by: 40,
  workspace_owner_id: 77,
  name: 'Chiến dịch lớn',
  nodes: Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, data: { html: 'x'.repeat(2000) } })),
  edges: [{ id: 'e1' }],
  schedule: { cron: '0 9 * * *' },
};
const runId = 812;

describe('sendEmailToCustomer → payload job (PR-Q2 việc a/e)', () => {
  let enqueueSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    enqueueSpy = jest.spyOn(outboundMessageQueueService, 'enqueueAndWait').mockResolvedValue({ status: 'success' });
  });

  it('payload.campaign chỉ mang id / id_user / created_by / workspace_owner_id', async () => {
    await campaignEmailSenderService.sendEmailToCustomer(actionNode, customer, bigCampaign, runId, null, { emailStep: 1 });

    const call = enqueueSpy.mock.calls[0][0];
    expect(call.type).toBe(OUTBOUND_MESSAGE_JOB_TYPES.EMAIL_SEND);
    expect(call.payload.campaign).toEqual({ id: 811, id_user: 39, created_by: 40, workspace_owner_id: 77 });
    expect(JSON.stringify(call.payload)).not.toContain('Chiến dịch lớn');
    expect(JSON.stringify(call.payload).length).toBeLessThan(2000);
  });

  it('jobKey = khoá giữ chỗ quota của đúng lần gửi logic (cùng runId/node/người nhận/bước)', async () => {
    await campaignEmailSenderService.sendEmailToCustomer(actionNode, customer, bigCampaign, runId, null, { emailStep: 2 });

    expect(enqueueSpy.mock.calls[0][0].jobKey).toBe(buildCampaignReservationKey({
      runId, nodeId: actionNode.id, channel: 'email', recipient: customer.email, logicalStep: 2,
    }));
  });

  it('thiếu runId (gửi lẻ ngoài lượt chạy) → không có jobKey', async () => {
    await campaignEmailSenderService.sendEmailToCustomer(actionNode, customer, bigCampaign, null, null, { emailStep: 1 });
    expect(enqueueSpy.mock.calls[0][0].jobKey).toBeNull();
  });
});

describe('sendEmailToCustomerDirect → khoá giữ chỗ + List-Unsubscribe', () => {
  const send = (campaign = bigCampaign) => campaignEmailSenderService.sendEmailToCustomerDirect(
    actionNode, customer, campaign, runId, null, { emailStep: 1 }
  );
  let sendRaw;
  const savedEnv = {};

  beforeEach(() => {
    jest.clearAllMocks();
    savedEnv.TRACKING_BASE_URL = process.env.TRACKING_BASE_URL;
    savedEnv.EMAIL_UNSUBSCRIBE_MAILTO = process.env.EMAIL_UNSUBSCRIBE_MAILTO;
    process.env.TRACKING_BASE_URL = 'https://founderai.biz';
    delete process.env.EMAIL_UNSUBSCRIBE_MAILTO;
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 951, status: 'reserved' });
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue(null);
    jest.spyOn(emailSuppressionRepository, 'findReason').mockResolvedValue(null);
    jest.spyOn(emailSuppressionRepository, 'upsert').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(emailSettingsSmtpService, 'logEmailSentWithClient').mockResolvedValue(1);
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10, email: 'sender@example.com', smtp_host: 'smtp.example.com',
    });
    sendRaw = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-q2' } });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('khoá gửi cho reserveSendQuota TRÙNG khoá jobKey mà sendEmailToCustomer đặt cho job', async () => {
    const enqueueSpy = jest.spyOn(outboundMessageQueueService, 'enqueueAndWait').mockResolvedValue({});
    await campaignEmailSenderService.sendEmailToCustomer(actionNode, customer, bigCampaign, runId, null, { emailStep: 1 });
    const jobKey = enqueueSpy.mock.calls[0][0].jobKey;

    await send();

    expect(mockReserveSendQuota.mock.calls[0][0].reservationKey).toBe(jobKey);
  });

  it('có List-Unsubscribe (URL POST theo token) và List-Unsubscribe-Post một chạm; URL trùng link chân thư', async () => {
    await send();

    const arg = sendRaw.mock.calls[0][0];
    const urlMatch = String(arg.headers['List-Unsubscribe']).match(/<(https:\/\/founderai\.biz\/api\/customers\/email-tracking\/unsubscribe\/([0-9a-f-]{36}))>/);
    expect(urlMatch).not.toBeNull();
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(String(arg.html)).toContain(urlMatch[1]);
  });

  it('có EMAIL_UNSUBSCRIBE_MAILTO thì thêm mailto đứng trước URL', async () => {
    process.env.EMAIL_UNSUBSCRIBE_MAILTO = 'huy-dang-ky@founderai.biz';

    await send();

    expect(sendRaw.mock.calls[0][0].headers['List-Unsubscribe'])
      .toMatch(/^<mailto:huy-dang-ky@founderai\.biz\?subject=unsubscribe>, <https:\/\//);
  });

  it('môi trường http (dev): có List-Unsubscribe nhưng KHÔNG có -Post (RFC 8058 bắt buộc HTTPS)', async () => {
    process.env.TRACKING_BASE_URL = 'http://localhost:5001';

    await send();

    const { headers } = sendRaw.mock.calls[0][0];
    expect(headers['List-Unsubscribe']).toMatch(/^<http:\/\/localhost:5001\/api\/customers\/email-tracking\/unsubscribe\//);
    expect(headers['List-Unsubscribe-Post']).toBeUndefined();
  });
});

describe('sendRawEmail → nodemailer', () => {
  // Các spy ở nhóm trước (kể cả sendRawEmail) phải được gỡ thì mới gọi được hàm thật.
  beforeEach(() => jest.restoreAllMocks());

  it('chuyển headers vào sendMail; không có headers thì không thêm khoá headers', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
    jest.spyOn(campaignEmailSenderService, 'getOrCreateTransporter').mockReturnValue({ sendMail });
    jest.spyOn(campaignEmailSenderService, 'applyEmailSendRateLimit').mockResolvedValue();
    const settings = { id: 1, email: 'sender@example.com', smtp_host: 'smtp.example.com' };

    await campaignEmailSenderService.sendRawEmail({
      settings, to: 'a@example.com', subject: 's', html: '<p>x</p>',
      headers: { 'List-Unsubscribe': '<https://x/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    expect(sendMail.mock.calls[0][0].headers).toEqual({
      'List-Unsubscribe': '<https://x/u>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });

    await campaignEmailSenderService.sendRawEmail({ settings, to: 'a@example.com', subject: 's', html: '<p>x</p>' });
    expect('headers' in sendMail.mock.calls[1][0]).toBe(false);
  });
});
