import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// B5b (PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP): gửi thử / Chạy thử email với `fromEmailId` trống phải dùng tài khoản email MẶC ĐỊNH
// của chủ workspace — đúng như lúc chạy thật (campaignEmailSender.service.js → findDefaultEmailSettings).

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn(),
  recordDirectSendUsage: jest.fn(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({ vnDayStart: new Date(), vnDayEnd: new Date(Date.now() + 86400000), vnNow: new Date() })),
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
};
jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: mockEmailSettingsRepository,
}));

const mockFindDefaultEmailSettings = jest.fn();
jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({
  default: { findDefaultEmailSettings: mockFindDefaultEmailSettings },
}));

const mockReserveSendQuota = jest.fn();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  markSendQuotaSending: jest.fn(),
  consumeSendQuota: jest.fn().mockResolvedValue({ status: 'consumed' }),
  releaseSendQuota: jest.fn(),
  markSendQuotaUncertain: jest.fn(),
}));

const { default: emailSettingsSmtpService } = await import('../emailSettingsSmtp.service.js');

const defaultAccount = {
  id: 7,
  smtp_host: 'smtp.example.com',
  smtp_port: 465,
  smtp_username: 'info@digiso.vn',
  smtp_password: 'enc_password',
  email: 'info@digiso.vn',
  name: 'Mặc định',
};

describe('emailSettingsSmtpService.sendCustomEmail — fromEmailId trống dùng tài khoản mặc định', () => {
  const fakeTransporter = { sendMail: jest.fn().mockResolvedValue({ messageId: 'm1' }) };
  const fakeDeps = {
    createSmtpTransporter: jest.fn(() => fakeTransporter),
    normalizeEmailList: jest.fn((val) => (val ? [val] : [])),
    buildTrackedHtml: jest.fn(async (html) => html),
    buildMailAttachments: jest.fn(async () => []),
    formatUtc7: jest.fn(() => '2026-10-18 10:00:00'),
  };
  const build = (payload) => ({
    userId: 99, // nhân viên (actor)
    roleCode: 'user',
    ownerContextId: 10, // chủ workspace
    payload: { to: 'a@example.com', subject: 'S', content: 'Nội dung', saveMessageLog: false, previewMode: true, ...payload },
    trackingConfig: { baseUrl: 'http://localhost:5001' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ id: 'res_1', mode: 'enforce', status: 'reserved' });
    fakeTransporter.sendMail.mockResolvedValue({ messageId: 'm1' });
  });

  it.each([[undefined], [null], [''], ['  ']])('fromEmailId=%p -> dung tai khoan mac dinh cua CHU workspace, khong goi getActiveById', async (blank) => {
    mockFindDefaultEmailSettings.mockResolvedValueOnce(defaultAccount);
    await emailSettingsSmtpService.sendCustomEmail(build({ fromEmailId: blank }), fakeDeps);
    expect(mockFindDefaultEmailSettings).toHaveBeenCalledWith(10);
    expect(mockEmailSettingsRepository.getActiveById).not.toHaveBeenCalled();
    expect(fakeTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('fromEmailId trong + khong co tai khoan nao -> 400 ro rang, khong gui', async () => {
    mockFindDefaultEmailSettings.mockResolvedValueOnce(null);
    await expect(emailSettingsSmtpService.sendCustomEmail(build({ fromEmailId: '' }), fakeDeps))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(fakeTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('co fromEmailId -> giu nguyen: kiem quyen so huu qua getActiveById, khong dung mac dinh; id cua nguoi khac -> 404', async () => {
    mockEmailSettingsRepository.getActiveById.mockResolvedValueOnce(null);
    await expect(emailSettingsSmtpService.sendCustomEmail(build({ fromEmailId: 55 }), fakeDeps))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockEmailSettingsRepository.getActiveById).toHaveBeenCalledWith(10, 55, { roleCode: 'user' });
    expect(mockFindDefaultEmailSettings).not.toHaveBeenCalled();
    expect(fakeTransporter.sendMail).not.toHaveBeenCalled();
  });
});
