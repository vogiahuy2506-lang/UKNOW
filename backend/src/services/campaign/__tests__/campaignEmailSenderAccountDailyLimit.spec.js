/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-2 Việc 3 — giới hạn gửi/ngày do NGƯỜI DÙNG tự đặt cho
 * TÀI KHOẢN gửi email. Mock thẳng accountDailyLimit.service.js (chỉ quan tâm nó được gọi đúng tham
 * số và kết quả của nó được map đúng khuôn `plan_send_limit_exceeded`) — không cần dựng lại DB.
 *
 * Ca quan trọng nhất: kiểm tra tài khoản đặt SAU khi reserveSendQuota() giữ chỗ quota gói thành
 * công, KHÔNG PHẢI trước — nếu không, "gói hết hạn giữa chừng" (resetAt=null, phải dừng hẳn) sẽ bị
 * giới hạn tài khoản (luôn có resetAt) che mất, hoãn nhầm thành "chờ tới 00:00".
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
  _clearQuotaCache: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

const mockCheckAccountDailyLimit = jest.fn();
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: mockCheckAccountDailyLimit,
}));

const mockReserveSendQuota = jest.fn();
const mockReleaseSendQuota = jest.fn().mockResolvedValue();
const mockMarkSendQuotaSending = jest.fn().mockResolvedValue();
const mockConsumeSendQuota = jest.fn().mockResolvedValue();
const mockMarkSendQuotaUncertain = jest.fn().mockResolvedValue();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  releaseSendQuota: mockReleaseSendQuota,
  markSendQuotaSending: mockMarkSendQuotaSending,
  consumeSendQuota: mockConsumeSendQuota,
  markSendQuotaUncertain: mockMarkSendQuotaUncertain,
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

const actionNode = {
  id: 'node_send_email_daily_limit',
  config: {
    fromEmailId: 10,
    emailSubject: 'Thông báo',
    emailBody: '<p>Nội dung kiểm tra</p>',
  },
};
const customer = { email: 'khach@example.com', full_name: 'Khách Test' };
const campaign = { id: 900, id_user: 39 };
const runId = 901;
const SETTINGS = { id: 10, email: 'sender@example.com', smtp_host: 'smtp.example.com', user_daily_send_limit: 100 };

const OFF_MODE_RESERVATION = { mode: 'off' };

describe('campaignEmailSenderService — giới hạn gửi/ngày theo tài khoản (Việc 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'isLeadConsentRefusedOrWithdrawn').mockResolvedValue(false);
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 88, email: customer.email });
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({ ...SETTINGS });
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({ messageId: 'ok-1' });
    mockReserveSendQuota.mockResolvedValue(OFF_MODE_RESERVATION);
  });

  it('chưa chạm giới hạn → gửi bình thường, đúng tham số truyền cho checkAccountDailyLimit', async () => {
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: true });

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.status).toBe('success');
    expect(mockCheckAccountDailyLimit).toHaveBeenCalledWith({
      channel: 'email',
      accountId: 10,
      limit: 100,
    });
  });

  it('settings.user_daily_send_limit là NULL (mặc định, chưa ai đặt) → limit truyền vào là null', async () => {
    campaignEmailSenderService.getEmailSettingsByRunNodeCache.mockResolvedValue({ ...SETTINGS, user_daily_send_limit: null });
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: true });

    await campaignEmailSenderService.sendEmailToCustomerDirect(actionNode, customer, campaign, runId, null, { emailStep: 1 });

    expect(mockCheckAccountDailyLimit).toHaveBeenCalledWith({ channel: 'email', accountId: 10, limit: null });
  });

  it('đã chạm giới hạn → trả plan_send_limit_exceeded đúng khuôn, KHÔNG gọi sendRawEmail', async () => {
    const resetAt = new Date('2026-09-23T17:00:00.000Z');
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: false, limit: 100, currentCount: 100, resetAt });

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result).toMatchObject({
      status: 'failed',
      errorType: 'plan_send_limit_exceeded',
      limitType: 'account_daily',
      period: null,
      resetAt: '2026-09-23T17:00:00.000Z',
    });
    expect(result.error).toContain('sender@example.com');
    expect(result.error).toContain('100 tin/ngày');
    expect(campaignEmailSenderService.sendRawEmail).not.toHaveBeenCalled();
  });

  it('quota gói (reservation enforce/test_enforce) đã giữ chỗ mà bị chặn vì giới hạn tài khoản → phải RELEASE, không tiêu mất chỗ đã giữ', async () => {
    mockReserveSendQuota.mockResolvedValue({ mode: 'enforce', id: 555, status: 'reserved' });
    mockCheckAccountDailyLimit.mockResolvedValue({
      allowed: false, limit: 50, currentCount: 50, resetAt: new Date('2026-09-23T17:00:00.000Z'),
    });

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode, customer, campaign, runId, null, { emailStep: 1 }
    );

    expect(result.status).toBe('failed');
    expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 555 }));
    expect(mockMarkSendQuotaSending).not.toHaveBeenCalled();
    expect(campaignEmailSenderService.sendRawEmail).not.toHaveBeenCalled();
  });

  // Việc 3 "Test bắt buộc" — hai cơ chế (quota GÓI vs giới hạn TÀI KHOẢN) dùng chung một đường
  // thoát (errorType: 'plan_send_limit_exceeded'), lẫn nhau là khách hết gói mà tưởng chỉ chờ 00:00.
  describe('gói hết hạn giữa chừng — KHÔNG bị giới hạn tài khoản che mất', () => {
    it('gói hết hạn (reserveSendQuota ném RESOURCE_LIMIT_EXCEEDED, resetAt=null) → dừng hẳn; checkAccountDailyLimit KHÔNG được gọi', async () => {
      const quotaErr = Object.assign(new Error('Gói dịch vụ đã hết hạn.'), {
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limitType: 'expired',
        resetAt: null,
      });
      mockReserveSendQuota.mockRejectedValue(quotaErr);

      const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
        actionNode, customer, campaign, runId, null, { emailStep: 1 }
      );

      expect(result).toMatchObject({ status: 'failed', errorType: 'plan_send_limit_exceeded', resetAt: null, limitType: 'expired' });
      // Đây là điều kiện chính: nếu checkAccountDailyLimit() BỊ GỌI trước, nghĩa là code đặt sai chỗ
      // (trước reserveSendQuota) — khi đó resetAt luôn có giá trị hợp lệ (không bao giờ null), che
      // mất tín hiệu "dừng hẳn" đúng của gói hết hạn.
      expect(mockCheckAccountDailyLimit).not.toHaveBeenCalled();
    });

    it('CẢ HAI cùng đúng (gói hết hạn VÀ tài khoản cũng đã chạm giới hạn ngày) → vẫn dừng hẳn vì resetAt=null, không hoãn nhầm', async () => {
      const quotaErr = Object.assign(new Error('Gói dịch vụ đã hết hạn.'), {
        code: 'RESOURCE_LIMIT_EXCEEDED', limitType: 'expired', resetAt: null,
      });
      mockReserveSendQuota.mockRejectedValue(quotaErr);
      // Nếu code (sai) gọi checkAccountDailyLimit trước, nó sẽ trả allowed:false với resetAt hợp lệ —
      // giả lập rõ ràng để nếu thứ tự sai, test này bắt được ngay (resetAt sẽ khác null).
      mockCheckAccountDailyLimit.mockResolvedValue({
        allowed: false, limit: 10, currentCount: 10, resetAt: new Date('2026-09-23T17:00:00.000Z'),
      });

      const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
        actionNode, customer, campaign, runId, null, { emailStep: 1 }
      );

      expect(result.resetAt).toBeNull();
      expect(result.limitType).toBe('expired');
      expect(mockCheckAccountDailyLimit).not.toHaveBeenCalled();
    });

    it('quota gói CÓ mốc reset (daily/monthly của gói, không phải account_daily) → vẫn đi qua nhánh cũ bình thường, không đụng logic mới', async () => {
      const quotaErr = Object.assign(new Error('Đã đạt giới hạn gửi trong ngày của gói.'), {
        code: 'RESOURCE_LIMIT_EXCEEDED', limitType: 'daily', resetAt: new Date('2026-09-23T17:00:00.000Z'),
      });
      mockReserveSendQuota.mockRejectedValue(quotaErr);

      const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
        actionNode, customer, campaign, runId, null, { emailStep: 1 }
      );

      expect(result).toMatchObject({ status: 'failed', errorType: 'plan_send_limit_exceeded', limitType: 'daily' });
      expect(result.resetAt).toBe('2026-09-23T17:00:00.000Z');
      expect(mockCheckAccountDailyLimit).not.toHaveBeenCalled();
    });
  });
});
