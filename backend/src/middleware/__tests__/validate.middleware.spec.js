import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockValidationResult = jest.fn();

jest.unstable_mockModule('express-validator', () => ({
  validationResult: mockValidationResult,
}));

const { default: handleValidationErrors } = await import('../validate.middleware.js');

describe('handleValidationErrors middleware', () => {
  let req, res, next, consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    req = {
      body: {
        username: 'testuser',
        email: 'test@example.com',
        emailVerificationCode: '123456',
        password: 'SuperSecretPassword123!',
        newPassword: 'AnotherSecretPassword456!',
        currentPassword: 'OldPassword789!',
        confirmPassword: 'SuperSecretPassword123!',
        token: 'secret-token-value',
        credential: 'google-credential-secret',
        access_token: 'oauth-token',
        phone: '0909888777',
      },
    };
    res = {
      statusCode: 200,
      body: null,
      status: jest.fn((code) => {
        res.statusCode = code;
        return res;
      }),
      json: jest.fn((data) => {
        res.body = data;
        return res;
      }),
    };
    next = jest.fn();
  });

  it('calls next() when there are no validation errors', () => {
    mockValidationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });

    handleValidationErrors(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('redacts sensitive fields in [Validation Body] and omits values in [Validation Error] when errors exist', () => {
    const rawErrors = [
      { path: 'password', msg: 'Mật khẩu phải có ít nhất 8 ký tự', value: 'secretPass' },
      { path: 'email', msg: 'Email không hợp lệ', value: 'bademail' },
    ];
    mockValidationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => rawErrors,
    });

    handleValidationErrors(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual(rawErrors);

    // Verify console.log was called
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);

    const errorLogCall = consoleLogSpy.mock.calls.find((call) => call[0] === '[Validation Error]');
    const bodyLogCall = consoleLogSpy.mock.calls.find((call) => call[0] === '[Validation Body]');

    expect(errorLogCall).toBeDefined();
    expect(bodyLogCall).toBeDefined();

    // Verify error values are omitted
    const loggedErrorJson = errorLogCall[1];
    const loggedBodyJson = bodyLogCall[1];

    expect(loggedErrorJson).not.toContain('secretPass');
    expect(loggedErrorJson).toContain('Mật khẩu phải có ít nhất 8 ký tự');

    expect(loggedBodyJson).toContain('[REDACTED]');
    expect(loggedBodyJson).not.toContain('123456');
    expect(loggedBodyJson).not.toContain('SuperSecretPassword123!');
    expect(loggedBodyJson).not.toContain('AnotherSecretPassword456!');
    expect(loggedBodyJson).not.toContain('OldPassword789!');
    expect(loggedBodyJson).not.toContain('secret-token-value');
    expect(loggedBodyJson).not.toContain('google-credential-secret');
    expect(loggedBodyJson).not.toContain('oauth-token');

    // Non-sensitive fields should still be present for debugging
    expect(loggedBodyJson).toContain('testuser');
    expect(loggedBodyJson).toContain('test@example.com');
  });
});
