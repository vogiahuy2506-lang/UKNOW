process.env.JWT_SECRET = 'test-jwt-secret-key-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-12345';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSendWelcomeEmail = jest.fn().mockResolvedValue(true);
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../services/email/welcomeEmailTemplate.service.js', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    getClient: jest.fn(async () => mockClient),
  },
}));

const mockFindInvitationByToken = jest.fn();
const mockMarkCodeAsUsed = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../services/verification.service.js', () => ({
  default: {
    findInvitationByToken: mockFindInvitationByToken,
    verifyCode: jest.fn(),
    markCodeAsUsed: mockMarkCodeAsUsed,
  },
}));

const mockFindMembershipsByEmployeeId = jest.fn().mockResolvedValue([
  { ownerId: 1, ownerName: 'Sếp', permissions: {} }
]);

jest.unstable_mockModule('../../repositories/user/user.repository.js', () => ({
  findActiveUserByEmail: jest.fn(),
  updatePasswordByEmail: jest.fn(),
  activateUserByEmail: jest.fn(),
  findMembershipsByEmployeeId: mockFindMembershipsByEmployeeId,
  insertRefreshToken: jest.fn(),
  revokeAllRefreshTokensForUser: jest.fn(),
  findActiveBillingPeriod: jest.fn().mockResolvedValue('monthly'),
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logSystem: jest.fn(),
  AUDIT_ACTIONS: { USER_REGISTERED: 'USER_REGISTERED' },
  AUDIT_ENTITY_TYPES: { USER: 'USER' },
}));

jest.unstable_mockModule('../../services/user/signupTrialTx.service.js', () => ({
  grantSignupTrialInTx: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../repositories/landingPageShare.repository.js', () => ({
  default: {
    claimPendingByUserId: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignShare.repository.js', () => ({
  default: {
    claimPendingByUserId: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../../repositories/ai/chatbotShare.repository.js', () => ({
  default: {
    claimPendingByUserId: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../../repositories/user/userConsent.repository.js', () => ({
  default: {
    recordConsents: jest.fn().mockResolvedValue([]),
    getUserLatestConsents: jest.fn().mockResolvedValue({}),
    hasConsentedCurrent: jest.fn().mockResolvedValue(true),
    isConsentVersionOutdated: jest.fn().mockReturnValue(false),
  },
  recordConsents: jest.fn().mockResolvedValue([]),
  getUserLatestConsents: jest.fn().mockResolvedValue({}),
  hasConsentedCurrent: jest.fn().mockResolvedValue(true),
  isConsentVersionOutdated: jest.fn().mockReturnValue(false),
}));

const authController = (await import('../auth.controller.js')).default;

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
}

describe('auth.controller invite registration flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
  });

  describe('GET /auth/invitation-info', () => {
    it('thiếu token → 400', async () => {
      const res = mockRes();
      await authController.getInvitationInfo({ query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Thiếu token lời mời' }));
    });

    it('token không hợp lệ hoặc hết hạn → 400', async () => {
      mockFindInvitationByToken.mockResolvedValueOnce(null);
      const res = mockRes();
      await authController.getInvitationInfo({ query: { token: 'invalid' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Link mời không hợp lệ hoặc đã hết hạn' }));
    });

    it('token hợp lệ → trả email và ownerName', async () => {
      mockFindInvitationByToken.mockResolvedValueOnce({ id: 10, email: 'nv@example.com' });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Nguyen Van Chu', username: 'chudn' }],
      });
      const res = mockRes();
      await authController.getInvitationInfo({ query: { token: 'valid_tok' } }, res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          email: 'nv@example.com',
          ownerName: 'Nguyen Van Chu',
        },
      });
    });
  });

  describe('POST /auth/register with inviteToken', () => {
    const validBody = {
      username: 'nhanvienmoi',
      email: 'nv@example.com',
      password: 'Password123!',
      fullName: 'Nhan Vien Moi',
      phone: '0912345678',
      inviteToken: 'invite_tok_123',
      consents: { terms: true, privacy: true, dpa: true },
    };

    it('inviteToken không hợp lệ → 400', async () => {
      mockFindInvitationByToken.mockResolvedValueOnce(null);
      const res = mockRes();
      await authController.register({ body: validBody, ip: '127.0.0.1', headers: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Link mời kích hoạt không hợp lệ hoặc đã hết hạn' }));
    });

    it('email đăng ký khác với email được mời trong token → 400', async () => {
      mockFindInvitationByToken.mockResolvedValueOnce({ id: 1, email: 'other@example.com' });
      const res = mockRes();
      await authController.register({ body: validBody, ip: '127.0.0.1', headers: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Email đăng ký không khớp với email được mời' }));
    });

    it('hợp lệ: bypass emailVerificationCode, cập nhật tài khoản pending_activation sang active', async () => {
      mockFindInvitationByToken.mockResolvedValueOnce({ id: 99, email: 'nv@example.com' });
      // 0. BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 1. check email (tìm thấy user pending_activation)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 50, status: 'pending_activation', referral_code: 'REF123', full_name: 'Emp Old' }],
      });
      // 2. check username
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 3. check phone
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 4. UPDATE users SET status = 'active'...
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 50,
            username: 'nhanvienmoi',
            email: 'nv@example.com',
            full_name: 'Nhan Vien Moi',
            status: 'active',
            role: 'user',
            phone: '0912345678',
            referral_code: 'REF123',
          },
        ],
      });
      // 5. recordConsents
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 6. COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = mockRes();
      await authController.register({ body: validBody, ip: '127.0.0.1', headers: {} }, res);

      expect(mockMarkCodeAsUsed).toHaveBeenCalledWith(99);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: expect.objectContaining({
              id: 50,
              username: 'nhanvienmoi',
              memberships: expect.any(Array),
            }),
          }),
        })
      );
    });
  });
});
