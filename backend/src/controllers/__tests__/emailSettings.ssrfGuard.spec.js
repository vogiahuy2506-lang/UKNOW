import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const createTransport = jest.fn((options) => ({ options, verify: jest.fn(), sendMail: jest.fn() }));
jest.unstable_mockModule('nodemailer', () => ({ default: { createTransport }, createTransport }));
jest.unstable_mockModule('../upload.controller.js', () => ({
  default: { readFileBufferByKey: jest.fn(), normalizeStorageKey: jest.fn(() => '') },
}));

const { default: emailSettingsController } = await import('../emailSettings.controller.js');

const ENV_KEYS = ['MAIL_SERVER', 'MAIL_PORT', 'TRACKING_BASE_URL', 'BACKEND_PUBLIC_URL'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

describe('emailSettingsController.createSmtpTransporter — chống SSRF', () => {
  beforeEach(() => {
    createTransport.mockClear();
    process.env.MAIL_SERVER = 'mail.digiso.vn';
  });

  it.each(['127.0.0.1', '10.0.0.8', '169.254.169.254', 'localhost', 'redis', '[::1]'])(
    'host nội bộ %s → lỗi "SMTP host không hợp lệ", không tạo transporter',
    (host) => {
      expect(() => emailSettingsController.createSmtpTransporter({ host, port: 6379, username: 'u', password: 'p' }))
        .toThrow('SMTP host không hợp lệ');
      expect(createTransport).not.toHaveBeenCalled();
    }
  );

  it('host người dùng nhập: giữ host/port, gắn getSocket đã chặn SSRF, tắt đọc file/URL', () => {
    emailSettingsController.createSmtpTransporter({ host: 'smtp.gmail.com', port: 2525, username: 'u', password: 'p' });
    const options = createTransport.mock.calls[0][0];
    expect(options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 2525,
      secure: false,
      auth: { user: 'u', pass: 'p' },
      tls: { rejectUnauthorized: false },
      pool: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(typeof options.getSocket).toBe('function');
  });

  it('SMTP mặc định của hệ thống (host trống hoặc đúng MAIL_SERVER) giữ đường kết nối cũ', () => {
    emailSettingsController.createSmtpTransporter({ host: '', port: '', username: '', password: '' });
    emailSettingsController.createSmtpTransporter({ host: 'MAIL.DIGISO.VN', port: 465, username: 'u', password: 'p' });
    for (const [options] of createTransport.mock.calls) {
      expect(options.getSocket).toBeUndefined();
      expect(options.disableUrlAccess).toBe(true);
    }
    expect(createTransport.mock.calls[0][0].host).toBe('mail.digiso.vn');
  });
});

describe('emailSettingsController.resolveTrackingBaseUrl — không tin Host/X-Forwarded-Host khi đã cấu hình', () => {
  function makeReq(headers, { trusted = false } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      get: (name) => lower[String(name).toLowerCase()],
      protocol: 'http',
      socket: { remoteAddress: '198.51.100.20' },
      app: { get: (key) => (key === 'trust proxy fn' ? () => trusted : undefined) },
    };
  }

  const spoofed = { host: 'evil.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' };

  it('ưu tiên TRACKING_BASE_URL', () => {
    process.env.TRACKING_BASE_URL = 'https://track.founderai.biz/';
    process.env.BACKEND_PUBLIC_URL = 'https://api.founderai.biz';
    expect(emailSettingsController.resolveTrackingBaseUrl(makeReq(spoofed)))
      .toEqual({ baseUrl: 'https://track.founderai.biz', isPublic: true, source: 'env' });
  });

  it('không có TRACKING_BASE_URL → BACKEND_PUBLIC_URL (bỏ hậu tố /api)', () => {
    delete process.env.TRACKING_BASE_URL;
    process.env.BACKEND_PUBLIC_URL = 'https://founderai.biz/api/';
    expect(emailSettingsController.resolveTrackingBaseUrl(makeReq(spoofed)))
      .toEqual({ baseUrl: 'https://founderai.biz', isPublic: true, source: 'env' });
  });

  it('chưa cấu hình env: X-Forwarded-* từ nguồn không tin cậy bị bỏ qua', () => {
    delete process.env.TRACKING_BASE_URL;
    delete process.env.BACKEND_PUBLIC_URL;
    expect(emailSettingsController.resolveTrackingBaseUrl(makeReq({ ...spoofed, host: 'localhost:5001' })))
      .toEqual({ baseUrl: 'http://localhost:5001', isPublic: false, source: 'request' });
  });

  it('chưa cấu hình env: qua proxy tin cậy thì dùng X-Forwarded-Host', () => {
    delete process.env.TRACKING_BASE_URL;
    delete process.env.BACKEND_PUBLIC_URL;
    const req = makeReq({ host: 'backend:5001', 'x-forwarded-host': 'app.founderai.biz' }, { trusted: true });
    req.protocol = 'https';
    expect(emailSettingsController.resolveTrackingBaseUrl(req))
      .toEqual({ baseUrl: 'https://app.founderai.biz', isPublic: true, source: 'request' });
  });
});
