import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));
jest.unstable_mockModule('../../../repositories/landingPageDomain.repository.js', () => ({
  default: { findAllActive: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({
  default: {},
}));
jest.unstable_mockModule('../../cloudflare.service.js', () => ({
  default: { purgeLandingCache: jest.fn().mockResolvedValue({ success: true }) },
}));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn(),
}));
jest.unstable_mockModule('../../../middleware/dynamicCors.middleware.js', () => ({
  clearVerifiedDomainsCache: jest.fn(),
}));

const landingPageDomainService = (await import('../landingPageDomain.service.js')).default;
const landingPageDomainRepository = (await import('../../../repositories/landingPageDomain.repository.js')).default;

/** Tiến trình con giả: phát 'close' (hoặc 'error') ở tick sau, như child_process thật. */
function fakeChild({ code = 0, error = null, stderr = '' } = {}) {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (error) {
      child.emit('error', error);
      return;
    }
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  });
  return child;
}

const ORIGINAL_SCRIPT = process.env.SSL_PROVISION_SCRIPT;

describe('landingPageDomainService.provisionSsl — script runs without a shell, only for valid hostnames', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    process.env.SSL_PROVISION_SCRIPT = '/opt/uknow/ssl-auto-provision.sh';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    if (ORIGINAL_SCRIPT === undefined) delete process.env.SSL_PROVISION_SCRIPT;
    else process.env.SSL_PROVISION_SCRIPT = ORIGINAL_SCRIPT;
    jest.restoreAllMocks();
  });

  it('does nothing when SSL_PROVISION_SCRIPT is not set', async () => {
    delete process.env.SSL_PROVISION_SCRIPT;
    await expect(landingPageDomainService.provisionSsl('lp.example.com')).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it.each([
    ['shell command separator', 'evil.com; touch /tmp/pwned'],
    ['command substitution', '$(id).example.com'],
    ['backticks', '`id`.example.com'],
    ['pipe', 'example.com|sh'],
    ['whitespace', 'a b.example.com'],
    ['embedded newline', 'example.com\ntouch /tmp/pwned'],
    ['leading dash (option injection)', '-rf.example.com'],
    ['path traversal', '../../etc/passwd'],
    ['no TLD', 'localhost'],
    ['empty', ''],
    ['null', null],
    ['too long', `${'a'.repeat(250)}.com`],
    ['label longer than 63', `${'a'.repeat(64)}.example.com`],
  ])('never spawns for an invalid hostname (%s)', async (_label, hostname) => {
    await expect(landingPageDomainService.provisionSsl(hostname)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns the script with the normalised hostname as a single argv entry and no shell', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ code: 0 }));

    await expect(landingPageDomainService.provisionSsl('  LP.Example.COM ')).resolves.toBeUndefined();

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = mockSpawn.mock.calls[0];
    expect(command).toBe('/opt/uknow/ssl-auto-provision.sh');
    expect(args).toEqual(['lp.example.com']);
    expect(options).toEqual(expect.objectContaining({ shell: false }));
  });

  it('keeps supporting "command + args" in SSL_PROVISION_SCRIPT without a shell', async () => {
    process.env.SSL_PROVISION_SCRIPT = 'sudo -n /opt/uknow/ssl-auto-provision.sh';
    mockSpawn.mockImplementation(() => fakeChild({ code: 0 }));

    await landingPageDomainService.provisionSsl('www.customer.vn');

    expect(mockSpawn).toHaveBeenCalledWith(
      'sudo',
      ['-n', '/opt/uknow/ssl-auto-provision.sh', 'www.customer.vn'],
      expect.objectContaining({ shell: false }),
    );
  });

  it('resolves (does not crash) when the script cannot be started', async () => {
    const enoent = Object.assign(new Error('spawn /opt/uknow/ssl-auto-provision.sh ENOENT'), { code: 'ENOENT' });
    mockSpawn.mockImplementation(() => fakeChild({ error: enoent }));

    await expect(landingPageDomainService.provisionSsl('lp.example.com')).resolves.toBeUndefined();
  });

  it('resolves when spawn throws synchronously', async () => {
    mockSpawn.mockImplementation(() => { throw new TypeError('bad argument'); });

    await expect(landingPageDomainService.provisionSsl('lp.example.com')).resolves.toBeUndefined();
  });

  it('resolves and logs stderr when the script exits non-zero', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ code: 1, stderr: 'certbot failed' }));

    await expect(landingPageDomainService.provisionSsl('lp.example.com')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('certbot failed'));
  });

  it('provisionSslForAllActiveDomains counts an invalid DB hostname as failed and never spawns for it', async () => {
    landingPageDomainRepository.findAllActive.mockResolvedValue([
      { id: 1, hostname: 'bad;host.com', cfManaged: false, cfHostnameId: null },
      { id: 2, hostname: 'lp.customer.com', cfManaged: false, cfHostnameId: null },
    ]);
    mockSpawn.mockImplementation(() => fakeChild({ code: 0 }));

    const result = await landingPageDomainService.provisionSslForAllActiveDomains();

    expect(result).toEqual(expect.objectContaining({ total: 2, attempted: 2, failed: 1 }));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn.mock.calls[0][1]).toEqual(['lp.customer.com']);
  });
});
