/**
 * PLAN_RA_SOAT_DOT3 PR-Q1 — các hành vi mới của campaignEmailSender.service.js:
 *  - việc 1: kiểm email_suppressions TRƯỚC reserveSendQuota() cho mọi nguồn người nhận; hard bounce SMTP ghi suppression
 *    kể cả khi người nhận không có trong bảng customers;
 *  - việc 3: SMTP đã nhận mà consumeSendQuota lỗi -> vẫn ghi dòng email_messages (đường không reservation);
 *  - việc 6: daily_sent_count chỉ tăng khi SMTP nhận thư.
 * Khuôn mock lấy từ campaignEmailSenderDeliveryFailedFlag.spec.js.
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
const mockMarkUncertain = jest.fn().mockResolvedValue();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  releaseSendQuota: jest.fn().mockResolvedValue(),
  markSendQuotaSending: jest.fn().mockResolvedValue(),
  consumeSendQuota: mockConsumeSendQuota,
  markSendQuotaUncertain: mockMarkUncertain,
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: emailSettingsSmtpService } = await import('../../email/emailSettingsSmtp.service.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');
const { default: emailSuppressionRepository } = await import('../../../repositories/email/emailSuppression.repository.js');
const { default: campaignRunRepository } = await import('../../../repositories/campaign/campaignRun.repository.js');

const actionNode = {
  id: 'node_send_email_suppression',
  config: { fromEmailId: 10, emailSubject: 'Thông báo', emailBody: '<p>Nội dung kiểm tra</p>' },
};
const customer = { email: 'Khach.Sheet@Example.com', full_name: 'Khach Sheet' };
const campaign = { id: 811, id_user: 39, workspace_owner_id: 77 };
const runId = 812;

const smtpErr = (message, responseCode, command) => Object.assign(new Error(message), { responseCode, command });
const send = () => campaignEmailSenderService.sendEmailToCustomerDirect(
  actionNode, customer, campaign, runId, null, { emailStep: 1 }
);

describe('campaignEmailSenderService — email_suppressions + dòng log + bộ đếm (PR-Q1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 951, status: 'reserved' });
    mockConsumeSendQuota.mockImplementation(async ({ persistSource }) => {
      if (typeof persistSource === 'function') await persistSource(FAKE_TX_CLIENT);
    });
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    // Người nhận từ Sheet: KHÔNG có dòng customers.
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageFailed').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageBounced').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markCustomerHardBounced').mockResolvedValue();
    jest.spyOn(campaignRunRepository, 'patchRunMetadata').mockResolvedValue();
    jest.spyOn(emailSuppressionRepository, 'findReason').mockResolvedValue(null);
    jest.spyOn(emailSuppressionRepository, 'upsert').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(emailSettingsSmtpService, 'logEmailSentWithClient').mockResolvedValue(1);
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10, email: 'sender@example.com', smtp_host: 'smtp.example.com',
    });
  });

  describe('việc 1 — kiểm danh sách cấm gửi trước khi giữ chỗ hạn mức', () => {
    it('đã huỷ đăng ký (suppression) -> skipped/unsubscribed, KHÔNG reserve, KHÔNG gọi SMTP — dù không có dòng customers', async () => {
      emailSuppressionRepository.findReason.mockResolvedValue('unsubscribe');
      const smtp = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'x' } });

      const result = await send();

      expect(result).toEqual({ to: customer.email, status: 'skipped', reason: 'unsubscribed' });
      expect(mockReserveSendQuota).not.toHaveBeenCalled();
      expect(smtp).not.toHaveBeenCalled();
    });

    it('hard bounce (suppression) -> skipped/hard_bounced', async () => {
      emailSuppressionRepository.findReason.mockResolvedValue('hard_bounce');
      const smtp = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'x' } });

      const result = await send();

      expect(result).toEqual({ to: customer.email, status: 'skipped', reason: 'hard_bounced' });
      expect(mockReserveSendQuota).not.toHaveBeenCalled();
      expect(smtp).not.toHaveBeenCalled();
    });

    it('tra theo workspace chủ (workspace_owner_id) + email viết thường', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'x' } });

      await send();

      expect(emailSuppressionRepository.findReason).toHaveBeenCalledWith(77, 'khach.sheet@example.com');
    });

    it('hard bounce SMTP ghi suppression cho người nhận KHÔNG có trong customers', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
        .mockRejectedValue(smtpErr('550 5.1.1 <khach.sheet@example.com> User unknown; no such user here', 550, 'RCPT TO'));

      const result = await send();

      expect(result.status).toBe('bounced');
      expect(result.bounceType).toBe('hard');
      expect(campaignEmailSenderRepository.markCustomerHardBounced).not.toHaveBeenCalled();
      expect(emailSuppressionRepository.upsert).toHaveBeenCalledTimes(1);
      expect(emailSuppressionRepository.upsert.mock.calls[0][0]).toMatchObject({
        workspaceOwnerId: 77,
        emailLower: 'khach.sheet@example.com',
        reason: 'hard_bounce',
      });
    });

    it('lỗi SMTP KHÔNG phải bounce người nhận (554 nội dung) -> không ghi suppression', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
        .mockRejectedValue(smtpErr('554 5.7.1 Message rejected due to content policy', 554, 'DATA'));

      await send();

      expect(emailSuppressionRepository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('việc 3 — consume lỗi sau khi SMTP đã nhận', () => {
    it('vẫn ghi dòng email_messages bằng đường không reservation (không debitWallet), reservation -> uncertain', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-ok-9' } });
      mockConsumeSendQuota.mockRejectedValueOnce(new Error('DB tạm gián đoạn lúc consume'));

      const result = await send();

      expect(result.status).toBe('success');
      expect(mockMarkUncertain).toHaveBeenCalledTimes(1);
      expect(emailSettingsController.logEmailSent).toHaveBeenCalledTimes(1);
      const payload = emailSettingsController.logEmailSent.mock.calls[0][0];
      expect(payload.trackingToken).toEqual(expect.any(String));
      expect(payload.info.messageId).toBe('msg-ok-9');
      expect(payload.status).toBeUndefined(); // dòng 'sent' mặc định
      expect(payload.deliveryFailed).toBeUndefined();
      expect(payload.debitWallet).toBeUndefined();
      expect(payload.quotaReservationId).toBeUndefined();
    });

    it('ĐỐI CHỨNG: consume thành công -> KHÔNG ghi dòng dự phòng', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-ok-10' } });

      await send();

      expect(emailSettingsController.logEmailSent).not.toHaveBeenCalled();
      expect(emailSettingsSmtpService.logEmailSentWithClient).toHaveBeenCalledTimes(1);
    });

    it('ghi dòng dự phòng cũng lỗi -> gửi vẫn coi là thành công (không ném)', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-ok-11' } });
      mockConsumeSendQuota.mockRejectedValueOnce(new Error('consume lỗi'));
      emailSettingsController.logEmailSent.mockRejectedValueOnce(new Error('ghi log cũng lỗi'));

      const result = await send();

      expect(result.status).toBe('success');
    });
  });

  describe('việc 6 — bộ đếm gửi của tài khoản SMTP', () => {
    it('SMTP từ chối (554) -> KHÔNG tăng daily_sent_count', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail')
        .mockRejectedValue(smtpErr('554 5.7.1 Message rejected due to content policy', 554, 'DATA'));

      await send();

      expect(campaignEmailSenderRepository.incrementEmailSettingsSentCount).not.toHaveBeenCalled();
    });

    it('ĐỐI CHỨNG: SMTP nhận thư -> tăng đúng 1 lần', async () => {
      jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ info: { messageId: 'msg-ok-12' } });

      await send();

      expect(campaignEmailSenderRepository.incrementEmailSettingsSentCount).toHaveBeenCalledTimes(1);
      expect(campaignEmailSenderRepository.incrementEmailSettingsSentCount).toHaveBeenCalledWith(10);
    });
  });
});
