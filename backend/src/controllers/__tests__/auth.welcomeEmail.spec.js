process.env.JWT_SECRET = 'test-jwt-secret-key-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-12345';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSendSystemEmail = jest.fn().mockResolvedValue(true);
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildWelcomeEmail: jest.fn(({ fullName, email, loginUrl }) => ({
    subject: `Chào mừng ${fullName || email}`,
    html: `<p>Login: ${loginUrl}</p>`,
  })),
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    getClient: jest.fn(async () => mockClient),
  },
}));

jest.unstable_mockModule('../../services/verification.service.js', () => ({
  default: {
    verifyCode: jest.fn(async () => ({ id: 1 })),
    markCodeAsUsed: jest.fn(async () => true),
  },
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
  AUDIT_ACTIONS: { USER_REGISTERED: 'USER_REGISTERED' },
  AUDIT_ENTITY_TYPES: { USER: 'USER' },
}));

const authController = (await import('../auth.controller.js')).default;

describe('auth.controller welcome email invariant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
  });

  it('passes recipient `to` matching user.email to sendSystemEmail on register', async () => {
    // senna merge wraps register() in an explicit transaction — not this test's
    // concern, but it means an extra client.query('BEGIN') now precedes the checks.
    // Disabling trial grant here too: it's a separate concern from the welcome-email
    // invariant this test verifies, and it would otherwise burn another query slot.
    process.env.SIGNUP_TRIAL_ENABLED = 'false';

    // 0. BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // 1. check email
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    // 2. check username
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    // 3. insert user
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          username: 'testuser',
          email: 'newuser@example.com',
          full_name: 'Test User',
          status: 'active',
          role: 'user',
        },
      ],
    });
    // 4. COMMIT
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      body: {
        username: 'testuser',
        email: 'newuser@example.com',
        password: 'password123',
        fullName: 'Test User',
        emailVerificationCode: '123456',
      },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'newuser@example.com',
        subject: expect.stringContaining('Chào mừng'),
        html: expect.stringContaining('Login'),
      })
    );
  });
});
