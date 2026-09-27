/**
 * PR-6 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26), Việc 2 — SMTP lỗi tạm thời TRƯỚC DATA phải thử
 * lại thay vì bounce/fail cứng. Khuôn mock lấy từ campaignEmailSenderRateLimit.spec.js (nhánh
 * anh em cùng cấu trúc) + reservation enforce từ campaignEmailSenderSaveMessageLogEnforce.spec.js
 * để có thể khẳng định reservation đã được RELEASE (chắc chắn chưa gửi), không phải markUncertain.
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

const mockReserveSendQuota = jest.fn();
const mockReleaseSendQuota = jest.fn().mockResolvedValue();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  releaseSendQuota: mockReleaseSendQuota,
  markSendQuotaSending: jest.fn().mockResolvedValue(),
  consumeSendQuota: jest.fn().mockResolvedValue(),
  markSendQuotaUncertain: jest.fn().mockResolvedValue(),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

const actionNode = {
  id: 'node_send_email_transient',
  config: {
    fromEmailId: 10,
    emailSubject: 'Thông báo',
    emailBody: '<p>Nội dung kiểm tra</p>',
  },
};

const customer = { email: 'test_transient@example.com', full_name: 'Nguyen Transient' };
const campaign = { id: 611, id_user: 39 };
const runId = 612;

describe('campaignEmailSenderService: SMTP lỗi tạm thời TRƯỚC DATA (PR-6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 501, status: 'reserved' });
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageFailed').mockResolvedValue();
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
  });

  it('transient lần 1 (retryMeta rỗng) → smtp_transient_retry_scheduled, reservation RELEASED, logEmailSent KHÔNG được gọi', async () => {
    const smtpError = Object.assign(
      new Error('Invalid greeting. response=421 4.7.0 too many connections'),
      { responseCode: 421, command: 'CONN' }
    );
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('smtp_transient_retry_scheduled');
    expect(result.retryAttemptCount).toBe(1);
    expect(result.error).toContain('lần 1/5');
    expect(result.settingId).toBe(10);

    expect(mockReleaseSendQuota).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 501, failureCode: 'SMTP_PRESEND_TRANSIENT' })
    );
    expect(emailSettingsController.logEmailSent).not.toHaveBeenCalled();
  });

  it('smtpLimitRetryCount: 5 (đã hết EMAIL_TRANSIENT_MAX_ATTEMPTS mặc định) → smtp_transient, released, có dòng failed', async () => {
    const smtpError = Object.assign(
      new Error('Invalid login: 454 4.7.0 Temporary authentication failure'),
      { responseCode: 454, command: 'AUTH PLAIN' }
    );
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, { smtpLimitRetryCount: 5 }, { emailStep: 1 }
    );

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('smtp_transient');
    expect(result.error).toContain('454');

    expect(mockReleaseSendQuota).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 501, failureCode: 'SMTP_PRESEND_TRANSIENT' })
    );
    expect(emailSettingsController.logEmailSent).toHaveBeenCalledTimes(1);
    expect(campaignEmailSenderRepository.markEmailMessageFailed).toHaveBeenCalledTimes(1);
  });

  it('454 KHÔNG còn dừng cả run như lỗi cấu hình (errorType không phải smtp_config)', async () => {
    const smtpError = Object.assign(
      new Error('Invalid login: 454 4.7.0 Temporary authentication failure'),
      { responseCode: 454, command: 'AUTH PLAIN' }
    );
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.errorType).not.toBe('smtp_config');
    expect(result.errorType).toBe('smtp_transient_retry_scheduled');
  });

  it('rate-limit vẫn thắng nếu khớp cả hai (thứ tự không đổi)', async () => {
    // "too many requests" khớp isSmtpProviderRateLimitError NHƯNG cũng có responseCode 421 +
    // command CONN (khớp cả isSmtpPreSendTransientError) — rate-limit phải thắng.
    const smtpError = Object.assign(
      new Error('421 4.7.0 Too many requests from this IP, please try again later'),
      { responseCode: 421, command: 'CONN' }
    );
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(smtpError);

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.errorType).toBe('smtp_rate_limited_retry_scheduled');
  });
});
