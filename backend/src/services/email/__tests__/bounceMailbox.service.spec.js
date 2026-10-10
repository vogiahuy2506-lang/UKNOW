import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const mockImapFlow = jest.fn();

jest.unstable_mockModule('imapflow', () => ({
  ImapFlow: mockImapFlow,
}));

jest.unstable_mockModule('mailparser', () => ({
  simpleParser: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({
  default: {},
}));

const { BounceMailboxService } = await import('../bounceMailbox.service.js');

describe('BounceMailboxService — syncBounceMailbox early returns', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Thiếu BOUNCE_* env → trả về status "skipped", reason "missing_bounce_imap_config", KHÔNG gọi ImapFlow', async () => {
    delete process.env.BOUNCE_DOMAIN;
    delete process.env.BOUNCE_IMAP_HOST;
    delete process.env.BOUNCE_IMAP_USER;
    delete process.env.BOUNCE_IMAP_PASS;

    const service = new BounceMailboxService();
    const result = await service.syncBounceMailbox();

    expect(result).toEqual({
      status: 'skipped',
      skipped: true,
      reason: 'missing_bounce_imap_config',
    });
    expect(mockImapFlow).not.toHaveBeenCalled();
  });

  it('isSyncing đang true → trả về status "skipped", reason "already_syncing", KHÔNG gọi ImapFlow', async () => {
    process.env.BOUNCE_DOMAIN = 'bounce.example.com';
    process.env.BOUNCE_IMAP_HOST = 'imap.example.com';
    process.env.BOUNCE_IMAP_USER = 'bounce@example.com';
    process.env.BOUNCE_IMAP_PASS = 'secret123';

    const service = new BounceMailboxService();
    service.isSyncing = true;

    const result = await service.syncBounceMailbox();

    expect(result).toEqual({
      status: 'skipped',
      skipped: true,
      reason: 'already_syncing',
    });
    expect(mockImapFlow).not.toHaveBeenCalled();
  });

  // PLAN_RA_SOAT_DOT3 PR-Q1 việc 5 — IMAP hỏng trước đây trả stats không có status nên cron_job_runs.recordRun mặc định
  // 'success': trang Tác vụ định kỳ hiện xanh trong khi không đọc được hộp thư bounce.
  it('IMAP không kết nối được → status "failure" + connectionError (không còn xanh giả)', async () => {
    process.env.BOUNCE_DOMAIN = 'bounce.example.com';
    process.env.BOUNCE_IMAP_HOST = 'imap.example.com';
    process.env.BOUNCE_IMAP_USER = 'bounce@example.com';
    process.env.BOUNCE_IMAP_PASS = 'secret123';
    mockImapFlow.mockImplementation(() => ({
      connect: jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND imap.example.com')),
      logout: jest.fn().mockResolvedValue(),
      usable: false,
    }));

    const service = new BounceMailboxService();
    const result = await service.syncBounceMailbox();

    expect(result.status).toBe('failure');
    expect(result.connectionError).toContain('ENOTFOUND');
    expect(service.isSyncing).toBe(false);
  });
});
