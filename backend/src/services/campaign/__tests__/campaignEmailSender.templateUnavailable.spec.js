/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 A1 — đường gửi email của chiến dịch:
 *  - mẫu phải thuộc CHỦ workspace của chiến dịch (findEmailTemplateById lọc id_user);
 *  - lưới an toàn: node có templateId mà mẫu không còn / không thuộc chủ -> KHÔNG gửi (không rơi về tiêu đề/nội dung mặc định),
 *    trả `failed` vĩnh viễn (không `retryScheduledAt`, errorType không phải `*_retry_scheduled`), chưa giữ quota, chưa chạm SMTP;
 *  - node KHÔNG có templateId (nội dung soạn thẳng) giữ nguyên hành vi.
 * Khuôn mock lấy từ campaignEmailSenderSuppressionPrQ1.spec.js.
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
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: emailSettingsSmtpService } = await import('../../email/emailSettingsSmtp.service.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');
const { default: emailSuppressionRepository } = await import('../../../repositories/email/emailSuppression.repository.js');

const customer = { email: 'khach@example.com', full_name: 'Khach' };
const campaign = { id: 811, id_user: 39, workspace_owner_id: 77 };
const runId = 812;
let smtp;

const nodeWith = (config, id = 'node_tpl') => ({ id, config: { fromEmailId: 10, ...config } });
const send = (node, sendMeta = { emailStep: 1 }) => campaignEmailSenderService.sendEmailToCustomerDirect(node, customer, campaign, runId, null, sendMeta);

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 951, status: 'reserved' });
  jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue(null);
  jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
  jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
  jest.spyOn(emailSuppressionRepository, 'findReason').mockResolvedValue(null);
  jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
  jest.spyOn(emailSettingsSmtpService, 'logEmailSentWithClient').mockResolvedValue(1);
  jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
  jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
    id: 10, email: 'sender@example.com', smtp_host: 'smtp.example.com',
  });
  smtp = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: '<ok@x>' } });
});

describe('getTemplateByRunNodeCache — lọc theo chủ workspace', () => {
  it('truyền chủ xuống repository và dùng id dạng số', async () => {
    const find = jest.spyOn(campaignEmailSenderRepository, 'findEmailTemplateById').mockResolvedValue({ id: 5, subject: 'S' });

    const template = await campaignEmailSenderService.getTemplateByRunNodeCache({ runId: 1, nodeId: 'a', templateId: '5', ownerId: 77 });

    expect(template).toEqual({ id: 5, subject: 'S' });
    expect(find).toHaveBeenCalledWith(5, 77);
  });

  it('cache theo run+node vẫn giữ: gọi lần hai (kể cả kết quả null) không truy vấn lại', async () => {
    const find = jest.spyOn(campaignEmailSenderRepository, 'findEmailTemplateById').mockResolvedValue(null);
    const input = { runId: 2, nodeId: 'b', templateId: 9, ownerId: 77 };

    expect(await campaignEmailSenderService.getTemplateByRunNodeCache(input)).toBeNull();
    expect(await campaignEmailSenderService.getTemplateByRunNodeCache(input)).toBeNull();

    expect(find).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['id rác', { templateId: 'abc', ownerId: 77 }],
    ['thiếu chủ', { templateId: 5, ownerId: undefined }],
    ['chủ không hợp lệ', { templateId: 5, ownerId: 'x' }],
  ])('%s -> null, KHÔNG chạm DB', async (_label, input) => {
    const find = jest.spyOn(campaignEmailSenderRepository, 'findEmailTemplateById').mockResolvedValue({ id: 5 });

    expect(await campaignEmailSenderService.getTemplateByRunNodeCache({ runId: 3, nodeId: 'c', ...input })).toBeNull();

    expect(find).not.toHaveBeenCalled();
  });
});

describe('sendEmailToCustomerDirect — lưới an toàn khi mẫu không còn', () => {
  it('có templateId mà mẫu null -> failed vĩnh viễn, KHÔNG reserve quota, KHÔNG gọi SMTP, KHÔNG dùng nội dung mặc định', async () => {
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);

    const result = await send(nodeWith({ emailTemplateId: 55 }));

    expect(result).toMatchObject({ to: 'khach@example.com', status: 'failed', errorType: 'email_template_unavailable' });
    expect(result.error).toContain('#55');
    expect(result.retryScheduledAt).toBeUndefined();
    expect(String(result.errorType)).not.toMatch(/retry_scheduled/);
    expect(mockReserveSendQuota).not.toHaveBeenCalled();
    expect(smtp).not.toHaveBeenCalled();
  });

  it('mẫu của bước email (emailSteps) cũng vậy', async () => {
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);

    const result = await send(nodeWith({ emailSteps: [{ templateId: 8 }] }));

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('email_template_unavailable');
    expect(smtp).not.toHaveBeenCalled();
  });

  it('chủ chiến dịch (workspace_owner_id) được truyền xuống tra mẫu', async () => {
    const lookup = jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);

    await send(nodeWith({ emailTemplateId: 55 }));

    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ templateId: 55, ownerId: 77 }));
  });

  it('mẫu CÓ (của chủ) -> gửi như cũ bằng nội dung mẫu', async () => {
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache')
      .mockResolvedValue({ id: 55, subject: 'Tiêu đề mẫu', body_html: '<p>Nội dung mẫu</p>', body_text: 'Nội dung mẫu', attachments: [] });

    const result = await send(nodeWith({ emailTemplateId: 55 }));

    expect(result.status).not.toBe('failed');
    expect(mockReserveSendQuota).toHaveBeenCalledTimes(1);
    expect(smtp).toHaveBeenCalledTimes(1);
    expect(mockReserveSendQuota.mock.calls[0][0].requestPayload).toMatchObject({ subject: 'Tiêu đề mẫu', templateId: 55 });
  });

  it('node KHÔNG có templateId (nội dung soạn thẳng trong config) -> giữ nguyên hành vi, vẫn gửi', async () => {
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);

    const result = await send(nodeWith({ emailSubject: 'Chủ đề soạn tay', emailBody: '<p>Nội dung soạn tay</p>' }));

    expect(result.status).not.toBe('failed');
    expect(smtp).toHaveBeenCalledTimes(1);
    expect(mockReserveSendQuota.mock.calls[0][0].requestPayload).toMatchObject({ subject: 'Chủ đề soạn tay' });
  });
});
