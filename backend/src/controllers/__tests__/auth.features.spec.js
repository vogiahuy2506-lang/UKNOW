process.env.JWT_SECRET = 'test-jwt-secret-key-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-12345';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * GET /api/auth/features (PR-2, xác thực SĐT — _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md
 * mục 4 PR-2 việc 1). Public, không auth — trang đăng ký cần đọc TRƯỚC khi có tài khoản.
 */

jest.unstable_mockModule('../../services/email/welcomeEmailTemplate.service.js', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn() },
}));
jest.unstable_mockModule('../../services/verification.service.js', () => ({
  default: { verifyCode: jest.fn(), markCodeAsUsed: jest.fn() },
}));
jest.unstable_mockModule('../../repositories/user/user.repository.js', () => ({
  findActiveUserByEmail: jest.fn(),
  updatePasswordByEmail: jest.fn(),
  activateUserByEmail: jest.fn(),
  findMembershipsByEmployeeId: jest.fn(),
  insertRefreshToken: jest.fn(),
  revokeAllRefreshTokensForUser: jest.fn(),
  findActiveBillingPeriod: jest.fn().mockResolvedValue('monthly'),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logSystem: jest.fn(),
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
}));
jest.unstable_mockModule('../../services/user/signupTrialTx.service.js', () => ({
  grantSignupTrialInTx: jest.fn().mockResolvedValue(null),
}));

const authController = (await import('../auth.controller.js')).default;

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /api/auth/features', () => {
  let originalProvider;

  beforeEach(() => {
    originalProvider = process.env.PHONE_OTP_PROVIDER;
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.PHONE_OTP_PROVIDER;
    else process.env.PHONE_OTP_PROVIDER = originalProvider;
  });

  it('PHONE_OTP_PROVIDER=mock → phoneOtpEnabled: true', async () => {
    process.env.PHONE_OTP_PROVIDER = 'mock';
    const res = mockRes();

    await authController.getFeatures({}, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { phoneOtpEnabled: true },
    });
  });

  it('PHONE_OTP_PROVIDER rỗng → phoneOtpEnabled: false (đường lùi)', async () => {
    delete process.env.PHONE_OTP_PROVIDER;
    const res = mockRes();

    await authController.getFeatures({}, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { phoneOtpEnabled: false },
    });
  });

  it('không cần req.user / không đòi đăng nhập — nhận req rỗng vẫn trả 200', async () => {
    process.env.PHONE_OTP_PROVIDER = 'esms';
    const res = mockRes();

    await authController.getFeatures({}, res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
