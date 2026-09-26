/**
 * PR-1 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — nhánh reservation `enforce` của lịch sử gửi email.
 * campaignEmailSenderSaveMessageLog.spec.js chỉ đi nhánh mode='off' (logEmailSent). Nhánh enforce ghi
 * dòng qua `persistSource` của consumeSendQuota → logEmailSentWithClient. Production đang `shadow`
 * nên nhánh này chưa chạy, nhưng khi bật `enforce` mà nhánh này quay lại "toggle tắt = không ghi dòng"
 * thì hạn mức gói lại không đếm được thư của chiến dịch — spec này giữ cho điều đó không xảy ra lặng lẽ.
 * Khuôn mock lấy từ campaignEmailSenderAccountDailyLimit.spec.js.
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
const { default: emailSettingsSmtpService } = await import('../../email/emailSettingsSmtp.service.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

const customer = { email: 'enforce_history@example.com', full_name: 'Nguyen Enforce' };
const campaign = { id: 410, id_user: 39 };
const runId = 510;
const actionNode = (saveMessageLog) => ({
  id: 'node_send_email_history_enforce',
  config: {
    fromEmailId: 10,
    emailSubject: 'Thông báo lịch sử gửi (enforce)',
    emailBody: '<p>Nội dung kiểm tra nhánh enforce</p>',
    saveMessageLog,
  },
});

describe('campaignEmailSenderService: lịch sử gửi luôn được ghi — nhánh reservation enforce (PR-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 77, status: 'reserved' });
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 89, email: customer.email });
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-enforce-1' } });
    jest.spyOn(emailSettingsSmtpService, 'logEmailSentWithClient').mockResolvedValue(1);
  });

  it('d. enforce + saveMessageLog=false: consume vẫn ghi dòng qua persistSource, KHÔNG lưu nội dung thư', async () => {
    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode(false), customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.status).toBe('success');
    expect(mockConsumeSendQuota).toHaveBeenCalledTimes(1);
    expect(typeof mockConsumeSendQuota.mock.calls[0][0].persistSource).toBe('function');
    expect(emailSettingsSmtpService.logEmailSentWithClient).toHaveBeenCalledTimes(1);
    const [client, payload] = emailSettingsSmtpService.logEmailSentWithClient.mock.calls[0];
    expect(client).toBe(FAKE_TX_CLIENT);
    expect(payload.trackedHtmlContent).toBeNull();
    expect(payload.plainTextContent).toBeNull();
    expect(payload.trackingToken).toEqual(expect.any(String));
    expect(payload.runId).toBe(runId);
    expect(payload.quotaReservationId).toBe(77);
  });

  it('e. enforce + saveMessageLog=true: ghi dòng kèm nội dung thư', async () => {
    await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode(true), customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(emailSettingsSmtpService.logEmailSentWithClient).toHaveBeenCalledTimes(1);
    const [, payload] = emailSettingsSmtpService.logEmailSentWithClient.mock.calls[0];
    expect(payload.trackedHtmlContent).toEqual(expect.any(String));
    expect(payload.trackedHtmlContent.length).toBeGreaterThan(0);
    expect(payload.plainTextContent).toEqual(expect.any(String));
  });
});
