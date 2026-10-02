import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';

/**
 * Mã xác minh email: sinh bằng CSPRNG + trần 5 lần nhập sai (verifyCodeWithAttemptLimit).
 */

const mockRepo = {
  verifyCodeWithAttemptLimit: jest.fn(),
  markUnusedCodesAsUsed: jest.fn(),
  createCode: jest.fn(),
  getSendCooldown: jest.fn(),
  markAsUsed: jest.fn(),
  findValidToken: jest.fn(),
};

jest.unstable_mockModule('../../repositories/verification.repository.js', () => ({
  default: mockRepo,
}));
jest.unstable_mockModule('../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: jest.fn().mockResolvedValue(true),
  buildEmployeeInvitationEmail: jest.fn(() => ({ subject: 'test', html: '<p>test</p>' })),
  buildEmployeeLinkNoticeEmail: jest.fn(() => ({ subject: 'test', html: '<p>test</p>' })),
}));
jest.unstable_mockModule('../email/welcomeEmailTemplate.service.js', () => ({
  loadCustomSystemEmailTemplate: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../sms/otpProvider.service.js', () => ({
  sendOtp: jest.fn(),
}));

const { default: verificationService } = await import('../verification.service.js');

describe('verification.service — generateCode dùng CSPRNG', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gọi crypto.randomInt(100000, 1000000), không dùng Math.random', () => {
    const randomIntSpy = jest.spyOn(crypto, 'randomInt');
    const mathRandomSpy = jest.spyOn(Math, 'random');

    const code = verificationService.generateCode();

    expect(randomIntSpy).toHaveBeenCalledWith(100000, 1000000);
    expect(mathRandomSpy).not.toHaveBeenCalled();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('luôn ra đúng 6 chữ số trong [100000, 999999]', () => {
    for (let i = 0; i < 200; i += 1) {
      const n = Number(verificationService.generateCode());
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});

describe('verification.service — verifyCode (mã email, trần 5 lần sai)', () => {
  beforeEach(() => {
    for (const fn of Object.values(mockRepo)) fn.mockReset();
  });

  it('đúng mã → trả bản ghi, gọi repository với trần 5 lần', async () => {
    mockRepo.verifyCodeWithAttemptLimit.mockResolvedValue({ id: 9, email: 'a@test.local' });

    const record = await verificationService.verifyCode('a@test.local', '123456');

    expect(record).toEqual({ id: 9, email: 'a@test.local' });
    expect(mockRepo.verifyCodeWithAttemptLimit).toHaveBeenCalledWith({
      email: 'a@test.local',
      code: '123456',
      type: 'email_verification',
      maxAttempts: 5,
    });
  });

  it('sai mã / hết lượt → null', async () => {
    mockRepo.verifyCodeWithAttemptLimit.mockResolvedValue(null);
    await expect(verificationService.verifyCode('a@test.local', '000000')).resolves.toBeNull();
  });

  it('mã dạng số (JSON number) được so như chuỗi', async () => {
    mockRepo.verifyCodeWithAttemptLimit.mockResolvedValue({ id: 1 });
    await verificationService.verifyCode('a@test.local', 123456);
    expect(mockRepo.verifyCodeWithAttemptLimit.mock.calls[0][0].code).toBe('123456');
  });

  it.each([
    ['mảng', ['123456']],
    ['object', { $ne: '' }],
    ['rỗng', ''],
    ['null', null],
    ['undefined', undefined],
  ])('mã kiểu %s → null, không chạm DB', async (_label, code) => {
    await expect(verificationService.verifyCode('a@test.local', code)).resolves.toBeNull();
    expect(mockRepo.verifyCodeWithAttemptLimit).not.toHaveBeenCalled();
  });

  it('thiếu email → null, không chạm DB', async () => {
    await expect(verificationService.verifyCode('', '123456')).resolves.toBeNull();
    expect(mockRepo.verifyCodeWithAttemptLimit).not.toHaveBeenCalled();
  });
});
