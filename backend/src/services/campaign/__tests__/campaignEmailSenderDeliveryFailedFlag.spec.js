/**
 * PR-T3 (PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27) Việc 2 — ghim cờ `deliveryFailed: true` ở ĐỦ 5 chỗ
 * gọi đường lỗi. Integration (emailSentDerivedTimestampsVn.test.js) chỉ kiểm logEmailSentWithClient
 * xử lý cờ; bỏ cờ ở một chỗ gọi thì thư hỏng lại thành "Đã gửi email" mà không test nào đỏ.
 * Khuôn mock lấy từ campaignEmailSenderSmtpTransient.spec.js + campaignEmailSenderSaveMessageLogEnforce.spec.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
const mockConsumeSendQuota = jest.fn(async ({ persistSource }) => {
  if (typeof persistSource === 'function') await persistSource(FAKE_TX_CLIENT);
});
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  releaseSendQuota: jest.fn().mockResolvedValue(),
  markSendQuotaSending: jest.fn().mockResolvedValue(),
  consumeSendQuota: mockConsumeSendQuota,
  markSendQuotaUncertain: jest.fn().mockResolvedValue(),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: emailSettingsSmtpService } = await import('../../email/emailSettingsSmtp.service.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

const actionNode = {
  id: 'node_send_email_delivery_failed',
  config: {
    fromEmailId: 10,
    emailSubject: 'Thông báo',
    emailBody: '<p>Nội dung kiểm tra</p>',
  },
};
const customer = { email: 'khach_hong@example.com', full_name: 'Nguyen Hong' };
const campaign = { id: 711, id_user: 39 };
const runId = 712;

const smtpErr = (message, responseCode, command) => Object.assign(new Error(message), { responseCode, command });
const send = (retryMeta = null) => campaignEmailSenderService.sendEmailToCustomerDirect(
  actionNode, customer, campaign, runId, retryMeta, { emailStep: 1 }
);
const onlyLogEmailSentPayload = () => {
  expect(emailSettingsController.logEmailSent).toHaveBeenCalledTimes(1);
  return emailSettingsController.logEmailSent.mock.calls[0][0];
};

describe('campaignEmailSenderService: thư hỏng gắn deliveryFailed ở đủ 5 chỗ gọi (PR-T3 Việc 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 901, status: 'reserved' });
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageFailed').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageBounced').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markCustomerHardBounced').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(emailSettingsSmtpService, 'logEmailSentWithClient').mockResolvedValue(1);
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
  });

  it('1. SMTP tạm thời đã hết lượt thử (454) → logEmailSent có deliveryFailed', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('Invalid login: 454 4.7.0 Temporary authentication failure', 454, 'AUTH PLAIN'));

    const result = await send({ smtpLimitRetryCount: 5 });

    expect(result.errorType).toBe('smtp_transient');
    expect(onlyLogEmailSentPayload().deliveryFailed).toBe(true);
  });

  it('2. lỗi cấu hình SMTP (535) → logEmailSent có deliveryFailed', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('Invalid login: 535 5.7.8 Error: authentication failed', 535, 'AUTH PLAIN'));

    const result = await send();

    expect(result.errorType).toBe('smtp_config');
    expect(onlyLogEmailSentPayload().deliveryFailed).toBe(true);
  });

  it('3. lỗi giao thư không phải "người nhận không tồn tại" → logEmailSent có deliveryFailed', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('554 5.7.1 Message rejected due to content policy', 554, 'DATA'));

    const result = await send();

    expect(result.errorType).toBe('smtp_delivery');
    expect(onlyLogEmailSentPayload().deliveryFailed).toBe(true);
  });

  it('4. hard bounce khi reservation enforce → persistSource ghi logEmailSentWithClient có deliveryFailed', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('550 5.1.1 <khach_hong@example.com> User unknown; no such user here', 550, 'RCPT TO'));

    await send();

    expect(mockConsumeSendQuota).toHaveBeenCalledTimes(1);
    expect(emailSettingsSmtpService.logEmailSentWithClient).toHaveBeenCalledTimes(1);
    const [client, payload] = emailSettingsSmtpService.logEmailSentWithClient.mock.calls[0];
    expect(client).toBe(FAKE_TX_CLIENT);
    expect(payload.deliveryFailed).toBe(true);
    expect(emailSettingsController.logEmailSent).not.toHaveBeenCalled();
  });

  it('5. hard bounce khi không có reservation → logEmailSent có deliveryFailed', async () => {
    mockReserveSendQuota.mockResolvedValue({ mode: 'off' });
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
      .mockRejectedValue(smtpErr('550 5.1.1 <khach_hong@example.com> User unknown; no such user here', 550, 'RCPT TO'));

    await send();

    expect(mockConsumeSendQuota).not.toHaveBeenCalled();
    expect(onlyLogEmailSentPayload().deliveryFailed).toBe(true);
  });

  it('ĐỐI CHỨNG: gửi thành công → KHÔNG gắn deliveryFailed', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-ok-1' } });

    const result = await send();

    expect(result.status).toBe('success');
    expect(emailSettingsSmtpService.logEmailSentWithClient).toHaveBeenCalledTimes(1);
    expect(emailSettingsSmtpService.logEmailSentWithClient.mock.calls[0][1].deliveryFailed).toBeUndefined();
  });
});
