import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-1 (xác thực SĐT bằng OTP) — verification.service.js, sendPhoneOtp/verifyPhoneOtp.
 * Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.4.
 */

const mockRepo = {
  getPhoneSendCooldown: jest.fn(),
  countPhoneCodesLast24h: jest.fn(),
  countUserPhoneCodesLast24h: jest.fn(),
  countAllPhoneCodesLast24h: jest.fn(),
  markUnusedPhoneCodesAsUsed: jest.fn(),
  createPhoneCode: jest.fn(),
  findValidPhoneCode: jest.fn(),
  findLatestActivePhoneCode: jest.fn(),
  bumpAttempts: jest.fn(),
  markAsUsed: jest.fn(),
  // Nhánh email — không dùng trong các test này nhưng module cần tồn tại đủ method.
  markUnusedCodesAsUsed: jest.fn(),
  createCode: jest.fn(),
  getSendCooldown: jest.fn(),
  findValidCode: jest.fn(),
  findValidToken: jest.fn(),
  userExistsByEmail: jest.fn(),
  userExistsByUsername: jest.fn(),
};

const mockSendOtp = jest.fn();

jest.unstable_mockModule('../../repositories/verification.repository.js', () => ({
  default: mockRepo,
}));
jest.unstable_mockModule('../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: jest.fn().mockResolvedValue(true),
}));
jest.unstable_mockModule('../sms/otpProvider.service.js', () => ({
  sendOtp: mockSendOtp,
}));

const { default: verificationService } = await import('../verification.service.js');

function resetRepoMocks() {
  for (const fn of Object.values(mockRepo)) fn.mockReset();
  mockSendOtp.mockReset();
}

describe('verification.service — sendPhoneOtp (ba lớp trần)', () => {
  beforeEach(() => {
    resetRepoMocks();
    mockRepo.getPhoneSendCooldown.mockResolvedValue({ blocked: false });
    mockRepo.countPhoneCodesLast24h.mockResolvedValue(0);
    mockRepo.countUserPhoneCodesLast24h.mockResolvedValue(0);
    mockRepo.countAllPhoneCodesLast24h.mockResolvedValue(0);
    mockRepo.markUnusedPhoneCodesAsUsed.mockResolvedValue(undefined);
    mockRepo.createPhoneCode.mockResolvedValue({ id: 1 });
    mockSendOtp.mockResolvedValue({ provider: 'mock', providerMessageId: 'mock' });
    delete process.env.PHONE_OTP_DAILY_CAP;
  });

  it('qua cả ba lớp → tạo mã 6 số, hết hạn 5 phút, gọi sendOtp, chuẩn hoá SĐT thô trước khi khoá', async () => {
    await verificationService.sendPhoneOtp({ userId: 10, phone: '+84 912 345 678' });

    expect(mockRepo.getPhoneSendCooldown).toHaveBeenCalledWith('0912345678', 60);
    expect(mockRepo.markUnusedPhoneCodesAsUsed).toHaveBeenCalledWith('0912345678', 10);
    const createArgs = mockRepo.createPhoneCode.mock.calls[0][0];
    expect(createArgs.phone).toBe('0912345678');
    expect(createArgs.userId).toBe(10);
    expect(createArgs.code).toMatch(/^\d{6}$/);
    expect(createArgs.expiresInMinutes).toBe(5);
    expect(mockSendOtp).toHaveBeenCalledWith({ phone: '0912345678', code: createArgs.code });
  });

  it('lớp 1 — cooldown 60s/số chặn trước, không tạo mã', async () => {
    mockRepo.getPhoneSendCooldown.mockResolvedValue({ blocked: true, retryAfterSec: 42 });

    await expect(verificationService.sendPhoneOtp({ userId: 10, phone: '0912345678' }))
      .rejects.toMatchObject({ status: 429, code: 'PHONE_OTP_COOLDOWN', retryAfterSec: 42 });
    expect(mockRepo.createPhoneCode).not.toHaveBeenCalled();
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('lớp 2 — 5 mã/số/ngày chặn, không kiểm tới lớp user/hệ thống', async () => {
    mockRepo.countPhoneCodesLast24h.mockResolvedValue(5);

    await expect(verificationService.sendPhoneOtp({ userId: 10, phone: '0912345678' }))
      .rejects.toMatchObject({ status: 429, code: 'PHONE_OTP_PHONE_DAILY_CAP' });
    expect(mockRepo.countUserPhoneCodesLast24h).not.toHaveBeenCalled();
    expect(mockRepo.createPhoneCode).not.toHaveBeenCalled();
  });

  it('lớp 3 — 5 mã/user/ngày chặn (đổi số liên tục không né được)', async () => {
    mockRepo.countUserPhoneCodesLast24h.mockResolvedValue(5);

    await expect(verificationService.sendPhoneOtp({ userId: 10, phone: '0912345678' }))
      .rejects.toMatchObject({ status: 429, code: 'PHONE_OTP_USER_DAILY_CAP' });
    expect(mockRepo.countAllPhoneCodesLast24h).not.toHaveBeenCalled();
    expect(mockRepo.createPhoneCode).not.toHaveBeenCalled();
  });

  it('lớp 4 — trần hệ thống PHONE_OTP_DAILY_CAP (mặc định 300)', async () => {
    mockRepo.countAllPhoneCodesLast24h.mockResolvedValue(300);

    await expect(verificationService.sendPhoneOtp({ userId: 10, phone: '0912345678' }))
      .rejects.toMatchObject({ status: 429, code: 'PHONE_OTP_SYSTEM_DAILY_CAP' });
    expect(mockRepo.createPhoneCode).not.toHaveBeenCalled();
  });

  it('lớp 4 đọc PHONE_OTP_DAILY_CAP từ env khi có đặt', async () => {
    process.env.PHONE_OTP_DAILY_CAP = '10';
    mockRepo.countAllPhoneCodesLast24h.mockResolvedValue(10);

    await expect(verificationService.sendPhoneOtp({ userId: 10, phone: '0912345678' }))
      .rejects.toMatchObject({ code: 'PHONE_OTP_SYSTEM_DAILY_CAP' });

    delete process.env.PHONE_OTP_DAILY_CAP;
  });
});

describe('verification.service — verifyPhoneOtp (5 lần sai mã chết)', () => {
  beforeEach(() => {
    resetRepoMocks();
  });

  it('đúng mã → markAsUsed, trả bản ghi', async () => {
    mockRepo.findValidPhoneCode.mockResolvedValue({ id: 5, attempts: 0 });
    mockRepo.markAsUsed.mockResolvedValue(undefined);

    const record = await verificationService.verifyPhoneOtp({ userId: 10, phone: '0912345678', code: '123456' });

    expect(record).toEqual({ id: 5, attempts: 0 });
    expect(mockRepo.markAsUsed).toHaveBeenCalledWith(5);
    expect(mockRepo.bumpAttempts).not.toHaveBeenCalled();
  });

  it('sai mã, còn mã hiệu lực, chưa chạm ngưỡng → cộng attempts, KHÔNG khoá mã', async () => {
    mockRepo.findValidPhoneCode.mockResolvedValue(null);
    mockRepo.findLatestActivePhoneCode.mockResolvedValue({ id: 7, attempts: 2 });
    mockRepo.bumpAttempts.mockResolvedValue(3);

    await expect(verificationService.verifyPhoneOtp({ userId: 10, phone: '0912345678', code: 'wrong1' }))
      .rejects.toMatchObject({ status: 400, code: 'PHONE_OTP_INVALID' });

    expect(mockRepo.bumpAttempts).toHaveBeenCalledWith(7);
    expect(mockRepo.markAsUsed).not.toHaveBeenCalled();
  });

  it('sai mã lần thứ 5 → mã bị khoá (markAsUsed) — chết, phải xin mã mới', async () => {
    mockRepo.findValidPhoneCode.mockResolvedValue(null);
    mockRepo.findLatestActivePhoneCode.mockResolvedValue({ id: 7, attempts: 4 });
    mockRepo.bumpAttempts.mockResolvedValue(5);

    await expect(verificationService.verifyPhoneOtp({ userId: 10, phone: '0912345678', code: 'wrong5' }))
      .rejects.toMatchObject({ code: 'PHONE_OTP_INVALID' });

    expect(mockRepo.markAsUsed).toHaveBeenCalledWith(7);
  });

  it('mã đã chết (is_used) rồi mới thử ĐÚNG mã → vẫn từ chối vì findValidPhoneCode không khớp (đã used)', async () => {
    // findValidPhoneCode tự lọc is_used=FALSE — mã chết thì không có candidate nào trả về.
    mockRepo.findValidPhoneCode.mockResolvedValue(null);
    mockRepo.findLatestActivePhoneCode.mockResolvedValue(null); // mã chết rồi thì cũng không còn "active"

    await expect(verificationService.verifyPhoneOtp({ userId: 10, phone: '0912345678', code: '123456' }))
      .rejects.toMatchObject({ code: 'PHONE_OTP_INVALID' });

    expect(mockRepo.bumpAttempts).not.toHaveBeenCalled();
  });

  it('chuẩn hoá SĐT thô trước khi tra cứu (khớp hành vi sendPhoneOtp)', async () => {
    mockRepo.findValidPhoneCode.mockResolvedValue({ id: 5, attempts: 0 });

    await verificationService.verifyPhoneOtp({ userId: 10, phone: '+84 912 345 678', code: '123456' });

    expect(mockRepo.findValidPhoneCode).toHaveBeenCalledWith({
      phone: '0912345678',
      userId: 10,
      code: '123456',
    });
  });
});
