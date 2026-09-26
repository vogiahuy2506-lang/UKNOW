import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// PR-1 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — lịch sử gửi email LUÔN được ghi; toggle
// saveMessageLog giờ chỉ quyết định có LƯU NỘI DUNG THƯ hay không. Khuôn mock lấy từ
// campaignEmailSenderRateLimit.spec.js: mock userSendLimit.util.js để reserveSendQuota() đi qua
// nhánh legacy mode='off' (SEND_QUOTA_RESERVATION_MODE mặc định 'off', không cần bảng reservation
// atomic thật) — nhánh này khiến reservationActive=false, tức đi qua logEmailSent() (không phải
// logEmailSentWithClient() của nhánh reservationActive=true, dùng chung một ternary
// shouldStoreBody nên cùng hành vi, không lặp lại toàn bộ kịch bản).
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
const { default: campaignRunRepository } = await import('../../../repositories/campaign/campaignRun.repository.js');

describe('campaignEmailSenderService: lịch sử gửi luôn được ghi (PR-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-abc123' } });
    jest.spyOn(campaignRunRepository, 'patchRunMetadata').mockResolvedValue();
  });

  const actionNodeBase = (saveMessageLog) => ({
    id: 'node_send_email_history',
    config: {
      fromEmailId: 10,
      emailSubject: 'Thông báo lịch sử gửi',
      emailBody: '<p>Nội dung kiểm tra lịch sử gửi</p>',
      saveMessageLog,
    },
  });

  const customer = { email: 'test_history@example.com', full_name: 'Nguyen Test' };
  const campaign = { id: 400, id_user: 39 };
  const runId = 500;

  // Ca (a) — plan Việc 1: saveMessageLog=false, gửi thành công → hàm ghi log ĐƯỢC gọi đúng 1 lần
  // với trackedHtmlContent === null và plainTextContent === null, còn trackingToken/runId đầy đủ.
  it('a. saveMessageLog=false: vẫn ghi dòng lịch sử, nhưng KHÔNG lưu nội dung thư', async () => {
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNodeBase(false),
      customer,
      campaign,
      runId,
      null,
      { emailStep: 1 }
    );

    expect(result.status).toBe('success');
    expect(emailSettingsController.logEmailSent).toHaveBeenCalledTimes(1);
    const call = emailSettingsController.logEmailSent.mock.calls[0][0];
    expect(call.trackedHtmlContent).toBeNull();
    expect(call.plainTextContent).toBeNull();
    expect(call.trackingToken).toEqual(expect.any(String));
    expect(call.trackingToken.length).toBeGreaterThan(0);
    expect(call.runId).toBe(runId);
    expect(call.campaignId).toBe(campaign.id);
  });

  // Ca (b) — saveMessageLog=true → gọi với body (nội dung thư có thật, không null).
  it('b. saveMessageLog=true: ghi dòng lịch sử kèm nội dung thư', async () => {
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNodeBase(true),
      customer,
      campaign,
      runId,
      null,
      { emailStep: 1 }
    );

    expect(result.status).toBe('success');
    expect(emailSettingsController.logEmailSent).toHaveBeenCalledTimes(1);
    const call = emailSettingsController.logEmailSent.mock.calls[0][0];
    expect(call.trackedHtmlContent).toEqual(expect.any(String));
    expect(call.trackedHtmlContent.length).toBeGreaterThan(0);
    expect(call.plainTextContent).toEqual(expect.any(String));
    expect(call.plainTextContent.length).toBeGreaterThan(0);
  });

  // Ca (c) — plan Việc 2: hàm ghi log ném lỗi → patchRunMetadata được gọi với lastMessageLogError,
  // và kết quả gửi vẫn status 'success' (lỗi ghi log không được chặn luồng gửi).
  it('c. logEmailSent ném lỗi → patchRunMetadata ghi lastMessageLogError, gửi vẫn coi là thành công', async () => {
    jest.spyOn(emailSettingsController, 'logEmailSent').mockRejectedValue(new Error('DB tạm gián đoạn lúc ghi email_messages'));

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNodeBase(true),
      customer,
      campaign,
      runId,
      null,
      { emailStep: 1 }
    );

    expect(result.status).toBe('success');
    expect(campaignRunRepository.patchRunMetadata).toHaveBeenCalledTimes(1);
    const [patchedRunId, patch] = campaignRunRepository.patchRunMetadata.mock.calls[0];
    expect(patchedRunId).toBe(runId);
    expect(patch.lastMessageLogError).toContain('DB tạm gián đoạn lúc ghi email_messages');
    expect(typeof patch.lastMessageLogErrorAt).toBe('string');
  });
});
