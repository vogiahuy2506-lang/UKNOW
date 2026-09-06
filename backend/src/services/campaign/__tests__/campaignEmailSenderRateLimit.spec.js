import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({
    vnDayStart: new Date(),
    vnDayEnd: new Date(Date.now() + 86400000),
    vnNow: new Date(),
  })),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

describe('campaignEmailSenderService: SMTP rate-limit handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
  });

  const actionNode = {
    id: 'node_send_email_limit',
    config: {
      fromEmailId: 10,
      emailSubject: 'Thông báo',
      emailBody: '<p>Nội dung kiểm tra</p>',
    },
  };

  const customer = { email: 'test_limit@example.com', full_name: 'Nguyen Test' };
  const campaign = { id: 338, id_user: 39 };
  const runId = 366;

  it('gắn providerResponse, providerResponseCode và settingId khi còn lượt retry', async () => {
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });

    const smtpError = new Error('450 4.7.1 Daily user sending quota exceeded');
    smtpError.responseCode = 450;
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode,
      customer,
      campaign,
      runId,
      { smtpLimitRetryCount: 0 },
      { emailStep: 1 }
    );

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('smtp_rate_limited_retry_scheduled');
    expect(result.providerResponse).toBe('450 4.7.1 Daily user sending quota exceeded');
    expect(result.providerResponseCode).toBe(450);
    expect(result.settingId).toBe(10);
    expect(result.retryAttemptCount).toBe(1);
  });

  it('gắn providerResponse, providerResponseCode và settingId khi đã hết lượt retry', async () => {
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });

    jest.spyOn(campaignEmailSenderService, 'resolveProviderRateLimitRetryConfig').mockReturnValue({
      delayMs: 60000,
      maxRetries: 3,
    });

    const smtpError = new Error('421 4.7.0 Too many requests from this IP, please try again later');
    smtpError.responseCode = 421;
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    // Giả lập đã đạt số lần retry tối đa (nextRetryCount = 4 > 3)
    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode,
      customer,
      campaign,
      runId,
      { smtpLimitRetryCount: 3 },
      { emailStep: 1 }
    );

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('smtp_rate_limited');
    expect(result.providerResponse).toBe('421 4.7.0 Too many requests from this IP, please try again later');
    expect(result.providerResponseCode).toBe(421);
    expect(result.settingId).toBe(10);
  });
});
