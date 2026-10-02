/**
 * SMTP tự cấu hình không được trỏ vào địa chỉ nội bộ (SSRF / dò cổng mạng nội bộ):
 * - kiểm nhanh host (IP/tên nội bộ) ở testConnection;
 * - getSocket của nodemailer phân giải DNS, chặn địa chỉ không công khai và ghim kết nối vào IP đã kiểm;
 * - lỗi chặn không làm kẹt pool của nodemailer và được xử lý quota như "chắc chắn chưa gửi".
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import net from 'node:net';
import nodemailer from 'nodemailer';

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn(),
  recordDirectSendUsage: jest.fn(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({ vnDayStart: new Date(), vnDayEnd: new Date(), vnNow: new Date() })),
  nextVnMidnight: jest.fn(() => new Date()),
  nextVnMonthStart: jest.fn(() => new Date()),
}));

const mockEmailSettingsRepository = {
  getById: jest.fn(),
  getActiveById: jest.fn(),
  incrementSentCount: jest.fn().mockResolvedValue(),
  findEmailDeliveryStatus: jest.fn().mockResolvedValue(null),
  withTransaction: jest.fn(async (cb) => cb({})),
  insertEmailMessage: jest.fn().mockResolvedValue(1),
  markCustomerHardBounced: jest.fn().mockResolvedValue(),
};
jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: mockEmailSettingsRepository,
}));

const mockReserveSendQuota = jest.fn();
const mockReleaseSendQuota = jest.fn();
const mockMarkSendQuotaUncertain = jest.fn();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  markSendQuotaSending: jest.fn(),
  consumeSendQuota: jest.fn(),
  releaseSendQuota: mockReleaseSendQuota,
  markSendQuotaUncertain: mockMarkSendQuotaUncertain,
}));

const {
  default: emailSettingsSmtpService,
  assertSmtpHostAllowed,
  createSafeSmtpGetSocket,
  isSystemSmtpHost,
  SMTP_HOST_BLOCKED_CODE,
  SMTP_HOST_INVALID_MESSAGE,
} = await import('../emailSettingsSmtp.service.js');

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  SSRF_ALLOW_LOOPBACK: process.env.SSRF_ALLOW_LOOPBACK,
  MAIL_SERVER: process.env.MAIL_SERVER,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function guardedTransport(options = {}) {
  return nodemailer.createTransport({
    host: 'smtp.attacker.example',
    port: 2525,
    secure: false,
    pool: true,
    maxConnections: 2,
    getSocket: createSafeSmtpGetSocket(),
    ...options,
  });
}

function mockDnsTable(table) {
  return jest.spyOn(dns.promises, 'lookup').mockImplementation(async (host) => {
    if (table[host]) return table[host];
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  });
}

/** Máy chủ SMTP giả tối giản (EHLO/MAIL/RCPT/DATA/QUIT). */
function startFakeSmtpServer() {
  const state = { connections: 0, messages: 0 };
  const server = net.createServer((socket) => {
    state.connections += 1;
    socket.on('error', () => {});
    socket.write('220 fake.smtp ESMTP\r\n');
    let buffer = '';
    let inData = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let index = buffer.indexOf('\r\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            state.messages += 1;
            socket.write('250 2.0.0 queued\r\n');
          }
        } else {
          const command = line.split(' ')[0].toUpperCase();
          if (command === 'EHLO' || command === 'HELO') socket.write('250-fake.smtp\r\n250 OK\r\n');
          else if (command === 'MAIL' || command === 'RCPT' || command === 'RSET' || command === 'NOOP') socket.write('250 OK\r\n');
          else if (command === 'DATA') {
            inData = true;
            socket.write('354 go ahead\r\n');
          } else if (command === 'QUIT') {
            socket.write('221 bye\r\n');
            socket.end();
          } else socket.write('502 unsupported\r\n');
        }
        index = buffer.indexOf('\r\n');
      }
    });
  });
  return { server, state };
}

afterEach(() => {
  jest.restoreAllMocks();
  restoreEnv();
});

describe('assertSmtpHostAllowed / isSystemSmtpHost', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '169.254.169.254', '[::1]', '::ffff:192.168.0.1',
    'localhost', 'redis', 'postgres', 'metadata.google.internal', 'mail.local',
  ])('chặn host nội bộ %s', (host) => {
    expect(() => assertSmtpHostAllowed(host)).toThrow(SMTP_HOST_INVALID_MESSAGE);
    try {
      assertSmtpHostAllowed(host);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400, code: SMTP_HOST_BLOCKED_CODE });
    }
  });

  it.each(['smtp.gmail.com', 'smtp.sendgrid.net', 'mail.example.vn', '74.125.24.108'])('cho phép %s (mọi cổng)', (host) => {
    expect(() => assertSmtpHostAllowed(host)).not.toThrow();
  });

  it('SMTP mặc định của hệ thống (MAIL_SERVER) không bị chặn dù là tên nội bộ', () => {
    process.env.MAIL_SERVER = 'postfix';
    expect(isSystemSmtpHost('POSTFIX.')).toBe(true);
    expect(() => assertSmtpHostAllowed('postfix')).not.toThrow();
    expect(() => assertSmtpHostAllowed('redis')).toThrow(SMTP_HOST_INVALID_MESSAGE);
  });
});

describe('emailSettingsSmtpService.testConnection', () => {
  it('host nội bộ → 400 "SMTP host không hợp lệ", không tạo transporter', async () => {
    const createSmtpTransporter = jest.fn();
    await expect(emailSettingsSmtpService.testConnection(
      { smtpHost: '172.17.0.1', smtpPort: 6379 },
      { createSmtpTransporter }
    )).rejects.toMatchObject({ statusCode: 400, message: SMTP_HOST_INVALID_MESSAGE });
    expect(createSmtpTransporter).not.toHaveBeenCalled();
  });

  it('host trống → dùng SMTP mặc định (không kiểm)', async () => {
    const verify = jest.fn().mockResolvedValue(true);
    const createSmtpTransporter = jest.fn(() => ({ verify }));
    await expect(emailSettingsSmtpService.testConnection({ smtpHost: '' }, { createSmtpTransporter }))
      .resolves.toEqual({ message: 'Kết nối SMTP thành công' });
    expect(verify).toHaveBeenCalled();
  });

  it('tên host phân giải ra IP nội bộ → 400 qua getSocket (nodemailer thật)', async () => {
    mockDnsTable({ 'smtp.attacker.example': [{ address: '10.0.0.25', family: 4 }] });
    const connectSpy = jest.spyOn(net, 'connect');
    await expect(emailSettingsSmtpService.testConnection(
      { smtpHost: 'smtp.attacker.example', smtpPort: 25 },
      { createSmtpTransporter: () => guardedTransport({ port: 25 }) }
    )).rejects.toMatchObject({ statusCode: 400, message: SMTP_HOST_INVALID_MESSAGE, code: SMTP_HOST_BLOCKED_CODE });
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('DNS lỗi → mã EDNS như nodemailer (không phải lỗi chặn)', async () => {
    mockDnsTable({});
    await expect(emailSettingsSmtpService.testConnection(
      { smtpHost: 'khong-ton-tai.example', smtpPort: 587 },
      { createSmtpTransporter: () => guardedTransport({ host: 'khong-ton-tai.example', port: 587 }) }
    )).rejects.toMatchObject({ code: 'EDNS', message: expect.stringContaining('ENOTFOUND') });
  });
});

describe('createSafeSmtpGetSocket với nodemailer thật', () => {
  let fake;
  let fakePort;

  beforeAll(async () => {
    fake = startFakeSmtpServer();
    await new Promise((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    fakePort = fake.server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => fake.server.close(resolve));
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.SSRF_ALLOW_LOOPBACK;
  });

  it('host bị chặn: mọi lần gửi đều lỗi ngay, pool không bị kẹt slot', async () => {
    mockDnsTable({ 'smtp.attacker.example': [{ address: '192.168.1.5', family: 4 }] });
    const transporter = guardedTransport();
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(transporter.sendMail({ from: 'a@example.com', to: 'b@example.com', text: 'x' }))
          .rejects.toMatchObject({ message: SMTP_HOST_INVALID_MESSAGE, smtpConnectStage: 'blocked', statusCode: 400 });
      }
    } finally {
      transporter.close();
    }
  }, 10000);

  it('cổng 465 (secure): host bị chặn → lỗi sạch, không treo', async () => {
    const transporter = guardedTransport({ host: '169.254.169.254', port: 465, secure: true });
    try {
      await expect(transporter.verify()).rejects.toMatchObject({ message: SMTP_HOST_INVALID_MESSAGE });
      await expect(transporter.sendMail({ from: 'a@example.com', to: 'b@example.com', text: 'x' }))
        .rejects.toMatchObject({ message: SMTP_HOST_INVALID_MESSAGE });
    } finally {
      transporter.close();
    }
  }, 10000);

  it('host công khai: kết nối ghim vào IP đã kiểm, verify + gửi thành công', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    const lookupSpy = mockDnsTable({ 'smtp.example.test': [{ address: '127.0.0.1', family: 4 }] });
    const transporter = guardedTransport({ host: 'smtp.example.test', port: fakePort });
    try {
      await expect(transporter.verify()).resolves.toBe(true);
      const info = await transporter.sendMail({ from: 'a@example.com', to: 'b@example.com', subject: 'x', text: 'xin chào' });
      expect(info.accepted).toEqual(['b@example.com']);
      expect(fake.state.messages).toBe(1);
      expect(lookupSpy).toHaveBeenCalledWith('smtp.example.test', { all: true, verbatim: true });
    } finally {
      transporter.close();
    }
  }, 10000);
});

describe('xử lý quota khi host SMTP bị chặn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveSendQuota.mockResolvedValue({ id: 'res_1', mode: 'enforce', status: 'reserved' });
  });

  const blockedErrorFromNodemailer = () => Object.assign(new Error(SMTP_HOST_INVALID_MESSAGE), {
    statusCode: 400,
    status: 400,
    code: 'ESOCKET', // nodemailer ghi đè code của lỗi socket
    command: 'CONN',
    smtpConnectStage: 'blocked',
  });

  it('sendTestEmail: release (không uncertain) và trả 400', async () => {
    mockEmailSettingsRepository.getById.mockResolvedValueOnce({
      id: 1, smtp_host: 'smtp.attacker.example', smtp_port: 25, smtp_username: 'u', smtp_password: 'p', email: 'a@x.vn',
    });
    const sendMail = jest.fn().mockRejectedValue(blockedErrorFromNodemailer());
    await expect(emailSettingsSmtpService.sendTestEmail({
      userId: 10, roleCode: 'user', ownerContextId: 10, id: 1, payload: { to: 'b@example.com' },
    }, { createSmtpTransporter: () => ({ sendMail }) }))
      .rejects.toMatchObject({ statusCode: 400, message: SMTP_HOST_INVALID_MESSAGE });
    expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: 'res_1',
      failureCode: SMTP_HOST_BLOCKED_CODE,
    }));
    expect(mockMarkSendQuotaUncertain).not.toHaveBeenCalled();
  });

  it('sendCustomEmail: release (không uncertain) và trả 400 thay vì "Soft bounce"', async () => {
    mockEmailSettingsRepository.getActiveById.mockResolvedValueOnce({
      id: 5, smtp_host: 'smtp.attacker.example', smtp_port: 25, smtp_username: 'u', smtp_password: 'p', email: 'a@x.vn',
    });
    const sendMail = jest.fn().mockRejectedValue(blockedErrorFromNodemailer());
    await expect(emailSettingsSmtpService.sendCustomEmail({
      userId: 10,
      roleCode: 'user',
      ownerContextId: 10,
      payload: { fromEmailId: 5, to: 'b@example.com', subject: 's', content: 'c', previewMode: true, saveMessageLog: false },
      trackingConfig: { baseUrl: 'https://api.example.com', isPublic: true, source: 'env' },
    }, {
      createSmtpTransporter: () => ({ sendMail }),
      normalizeEmailList: () => [],
      buildTrackedHtml: async (html) => html,
      buildMailAttachments: async () => [],
      formatUtc7: () => '2026-09-30T00:00:00.000Z',
    })).rejects.toMatchObject({ statusCode: 400, message: SMTP_HOST_INVALID_MESSAGE });
    expect(mockReleaseSendQuota).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: 'res_1',
      failureCode: SMTP_HOST_BLOCKED_CODE,
    }));
    expect(mockMarkSendQuotaUncertain).not.toHaveBeenCalled();
  });
});
