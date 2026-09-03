import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCheckSendQuota = jest.fn();
const mockRecordDirectSendUsage = jest.fn();

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: mockRecordDirectSendUsage,
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({
    vnDayStart: new Date(),
    vnDayEnd: new Date(Date.now() + 86400000),
    vnNow: new Date(),
  })),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

const mockEmailSettingsRepository = {
  getById: jest.fn(),
  getActiveById: jest.fn(),
  incrementSentCount: jest.fn().mockResolvedValue(),
  findEmailDeliveryStatus: jest.fn().mockResolvedValue(null),
  withTransaction: jest.fn(async (cb) => cb({})),
  insertEmailMessage: jest.fn().mockResolvedValue(999),
  updateCustomerLastEmailSent: jest.fn().mockResolvedValue(),
  upsertCampaignCustomer: jest.fn().mockResolvedValue(),
  upsertCampaignParticipation: jest.fn().mockResolvedValue(),
  insertCustomerJourney: jest.fn().mockResolvedValue(),
  incrementCampaignSent: jest.fn().mockResolvedValue(),
  getOwnedCampaign: jest.fn().mockResolvedValue(null),
  findCustomerByEmail: jest.fn().mockResolvedValue(null),
  markCustomerHardBounced: jest.fn().mockResolvedValue(),
};

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: mockEmailSettingsRepository,
}));

const mockReserveSendQuota = jest.fn();
const mockMarkSendQuotaSending = jest.fn();
const mockConsumeSendQuota = jest.fn();
const mockReleaseSendQuota = jest.fn();
const mockMarkSendQuotaUncertain = jest.fn();

jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  markSendQuotaSending: mockMarkSendQuotaSending,
  consumeSendQuota: mockConsumeSendQuota,
  releaseSendQuota: mockReleaseSendQuota,
  markSendQuotaUncertain: mockMarkSendQuotaUncertain,
}));

const { default: emailSettingsSmtpService } = await import('../emailSettingsSmtp.service.js');

describe('emailSettingsSmtpService — Atomic Quota Reservation Protocol', () => {
  const fakeTransporter = {
    sendMail: jest.fn(),
  };

  const fakeDeps = {
    createSmtpTransporter: jest.fn(() => fakeTransporter),
    normalizeEmailList: jest.fn((val) => (val ? [val] : [])),
    buildTrackedHtml: jest.fn(async (html) => html),
    buildMailAttachments: jest.fn(async () => []),
    formatUtc7: jest.fn(() => '2026-09-01 23:00:00'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendTestEmail', () => {
    it('enforces atomic reservation and consumes quota on SMTP success', async () => {
      mockEmailSettingsRepository.getById.mockResolvedValueOnce({
        id: 1,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'test@example.com',
        smtp_password: 'enc_password',
        email: 'test@example.com',
        name: 'Sender',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_1',
        mode: 'enforce',
        status: 'reserved',
      });

      fakeTransporter.sendMail.mockResolvedValueOnce({
        messageId: 'smtp_msg_100',
      });

      mockConsumeSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_1',
        status: 'consumed',
      });

      const result = await emailSettingsSmtpService.sendTestEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        id: 1,
        payload: {
          to: 'recipient@example.com',
          subject: 'Test subject',
          content: 'Test content',
        },
      }, fakeDeps);

      expect(mockReserveSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        userId: 10,
        channel: 'email',
        quantity: 1,
        reservationKey: expect.stringMatching(/^preview:email:10:h_[0-9a-f]{20}:[0-9a-f]{16}$/),
      }));

      expect(mockMarkSendQuotaSending).toHaveBeenCalledWith({ reservationId: 'res_email_test_1' });
      expect(fakeTransporter.sendMail).toHaveBeenCalledTimes(1);
      expect(mockConsumeSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_email_test_1',
        responsePayload: expect.objectContaining({ messageId: 'smtp_msg_100' }),
      }));
      expect(result.messageId).toBe('smtp_msg_100');
    });

    it('releases quota on SMTP dispatch error', async () => {
      mockEmailSettingsRepository.getById.mockResolvedValueOnce({
        id: 1,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'test@example.com',
        smtp_password: 'enc_password',
        email: 'test@example.com',
        name: 'Sender',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_2',
        mode: 'enforce',
        status: 'reserved',
      });

      fakeTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      await expect(emailSettingsSmtpService.sendTestEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        id: 1,
        payload: {
          to: 'recipient@example.com',
        },
      }, fakeDeps)).rejects.toThrow('SMTP connection refused');

      expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_email_test_2',
        reason: 'SMTP connection refused',
      }));
      expect(mockConsumeSendQuota).not.toHaveBeenCalled();
    });

    // Trước bản vá 02/09/2026: tạo transporter/giải mã mật khẩu nằm ngoài mọi try/catch
    // sau markSendQuotaSending() — lỗi ở bước này (vd. khoá giải mã sai) làm reservation
    // mắc kẹt vĩnh viễn ở 'sending' dù provider chưa từng được gọi.
    it('releases quota when createSmtpTransporter throws (provider chưa từng được gọi)', async () => {
      mockEmailSettingsRepository.getById.mockResolvedValueOnce({
        id: 1,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'test@example.com',
        smtp_password: 'corrupted_password',
        email: 'test@example.com',
        name: 'Sender',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_transporter_fail',
        mode: 'enforce',
        status: 'reserved',
      });

      const brokenDeps = {
        ...fakeDeps,
        createSmtpTransporter: jest.fn(() => {
          throw new Error('Decrypt failed: bad key');
        }),
      };

      await expect(emailSettingsSmtpService.sendTestEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        id: 1,
        payload: { to: 'recipient@example.com' },
      }, brokenDeps)).rejects.toThrow('Decrypt failed: bad key');

      expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_email_test_transporter_fail',
        failureCode: 'SMTP_TRANSPORTER_INIT_FAILED',
      }));
      expect(fakeTransporter.sendMail).not.toHaveBeenCalled();
      expect(mockConsumeSendQuota).not.toHaveBeenCalled();
    });

    // Trước bản vá: consumeSendQuota() ở nhánh thành công không có try/catch — nếu nó lỗi
    // sau khi SMTP đã gửi thật, exception văng thẳng lên và reservation không chuyển sang
    // 'uncertain', mắc kẹt ở 'sending' dù thư đã tới người nhận thật.
    it('marks reservation uncertain when consumeSendQuota fails after SMTP already succeeded', async () => {
      mockEmailSettingsRepository.getById.mockResolvedValueOnce({
        id: 1,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'test@example.com',
        smtp_password: 'enc_password',
        email: 'test@example.com',
        name: 'Sender',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_consume_fail',
        mode: 'enforce',
        status: 'reserved',
      });

      fakeTransporter.sendMail.mockResolvedValueOnce({ messageId: 'smtp_msg_already_sent' });
      mockConsumeSendQuota.mockRejectedValueOnce(new Error('ledger write timed out'));

      const result = await emailSettingsSmtpService.sendTestEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        id: 1,
        payload: { to: 'recipient@example.com' },
      }, fakeDeps);

      // Thư đã gửi thật — hàm KHÔNG được ném lỗi hay báo thất bại cho người dùng.
      expect(result.messageId).toBe('smtp_msg_already_sent');
      expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_email_test_consume_fail',
        failureCode: 'CONSUME_DB_FAILED',
      }));
      expect(mockReleaseSendQuota).not.toHaveBeenCalled();
    });

    it('replays response without calling SMTP if reservation was already consumed', async () => {
      mockEmailSettingsRepository.getById.mockResolvedValueOnce({
        id: 1,
        email: 'test@example.com',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_email_test_3',
        mode: 'enforce',
        status: 'consumed',
        responsePayload: { messageId: 'smtp_cached_msg_999' },
      });

      const result = await emailSettingsSmtpService.sendTestEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        id: 1,
        payload: {
          to: 'recipient@example.com',
        },
      }, fakeDeps);

      expect(result.messageId).toBe('smtp_cached_msg_999');
      expect(result.isReplay).toBe(true);
      expect(fakeTransporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendCustomEmail', () => {
    it('enforces atomic reservation for multiple recipients (to + cc) and consumes on success', async () => {
      mockEmailSettingsRepository.getActiveById.mockResolvedValueOnce({
        id: 5,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'info@digiso.vn',
        smtp_password: 'enc_password',
        email: 'info@digiso.vn',
        name: 'Digiso Info',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_custom_1',
        mode: 'enforce',
        status: 'reserved',
      });

      fakeTransporter.sendMail.mockResolvedValueOnce({
        messageId: 'smtp_custom_msg_1',
      });

      mockConsumeSendQuota.mockResolvedValueOnce({
        id: 'res_custom_1',
        status: 'consumed',
      });

      const result = await emailSettingsSmtpService.sendCustomEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        payload: {
          fromEmailId: 5,
          to: 'buyer@example.com',
          cc: 'manager@example.com',
          subject: 'Order confirmation',
          content: 'Thank you for your order.',
          saveMessageLog: false,
          previewMode: true,
        },
        trackingConfig: {
          baseUrl: 'http://localhost:5001',
          isPublic: false,
          source: 'custom_send',
        },
      }, fakeDeps);

      // Recipient count is 2 (1 to + 1 cc)
      expect(mockReserveSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        userId: 10,
        channel: 'email',
        quantity: 2,
        reservationKey: expect.stringMatching(/^preview:email:10:h_[0-9a-f]{20}:[0-9a-f]{16}$/),
      }));

      expect(mockConsumeSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_custom_1',
      }));

      expect(result.messageId).toBe('smtp_custom_msg_1');
    });

    it('releases quota on hard bounce or auth error', async () => {
      mockEmailSettingsRepository.getActiveById.mockResolvedValueOnce({
        id: 5,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'info@digiso.vn',
        smtp_password: 'enc_password',
        email: 'info@digiso.vn',
        name: 'Digiso Info',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_custom_2',
        mode: 'enforce',
        status: 'reserved',
      });

      const authErr = new Error('Invalid login: 535 Authentication failed');
      authErr.code = 'EAUTH';
      fakeTransporter.sendMail.mockRejectedValueOnce(authErr);

      await expect(emailSettingsSmtpService.sendCustomEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        payload: {
          fromEmailId: 5,
          to: 'invalid@example.com',
          subject: 'Hello',
          content: 'Test content',
          saveMessageLog: false,
          previewMode: true,
        },
        trackingConfig: { baseUrl: 'http://localhost:5001' },
      }, fakeDeps)).rejects.toThrow();

      expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_custom_2',
      }));
      expect(mockConsumeSendQuota).not.toHaveBeenCalled();
    });

    it('consumes quota with failure snapshot on hard bounce (billable dispatch)', async () => {
      mockEmailSettingsRepository.getActiveById.mockResolvedValueOnce({
        id: 5,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_username: 'info@digiso.vn',
        smtp_password: 'enc_password',
        email: 'info@digiso.vn',
        name: 'Digiso Info',
      });

      mockReserveSendQuota.mockResolvedValueOnce({
        id: 'res_custom_hb',
        status: 'reserved',
        mode: 'enforce',
      });

      const hardBounceErr = new Error('550 5.1.1 User unknown');
      hardBounceErr.responseCode = 550;
      fakeTransporter.sendMail.mockRejectedValueOnce(hardBounceErr);

      await expect(emailSettingsSmtpService.sendCustomEmail({
        userId: 10,
        roleCode: 'user',
        ownerContextId: 10,
        payload: {
          fromEmailId: 5,
          to: 'invalid@example.com',
          subject: 'Hello',
          content: 'Test content',
          saveMessageLog: false,
          previewMode: true,
        },
        trackingConfig: { baseUrl: 'http://localhost:5001' },
      }, fakeDeps)).rejects.toThrow();

      expect(mockConsumeSendQuota).toHaveBeenCalledWith(expect.objectContaining({
        reservationId: 'res_custom_hb',
        responseSnapshot: expect.objectContaining({
          failed: true,
          errorType: 'hard_bounce',
        }),
      }));
    });
  });
});
