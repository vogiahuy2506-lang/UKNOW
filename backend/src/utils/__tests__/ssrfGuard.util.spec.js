import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';
import {
  assertPublicHost,
  assertPublicUrl,
  connectToPublicHost,
  createPinnedLookup,
  isLoopbackAllowed,
  isObviouslyNonPublicHost,
  isPublicIpAddress,
  isSsrfBlockedError,
  safeFetch,
  safeHttpRequest,
  SSRF_BLOCKED_CODE,
} from '../ssrfGuard.util.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW_LOOPBACK = process.env.SSRF_ALLOW_LOOPBACK;

function restoreEnv() {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_ALLOW_LOOPBACK === undefined) delete process.env.SSRF_ALLOW_LOOPBACK;
  else process.env.SSRF_ALLOW_LOOPBACK = ORIGINAL_ALLOW_LOOPBACK;
}

async function expectBlocked(promise) {
  await expect(promise).rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, status: 400 });
}

afterEach(() => {
  jest.restoreAllMocks();
  restoreEnv();
});

describe('assertPublicUrl — IP literal (không cần DNS)', () => {
  let lookupSpy;
  beforeEach(() => {
    lookupSpy = jest.spyOn(dns.promises, 'lookup');
  });

  it.each([
    ['http://2130706433/', 'thập phân'],
    ['http://0177.0.0.1/', 'bát phân'],
    ['http://0x7f.1/', 'thập lục phân'],
    ['http://0x7f000001/', 'thập lục phân liền'],
    ['http://127.1/', 'dạng rút gọn'],
    ['http://127.0.0.1:5001/api/internal', 'loopback + cổng'],
    ['http://0/', '0 → 0.0.0.0'],
    ['http://0.0.0.0/', '0.0.0.0'],
    ['http://10.1.2.3/', '10/8'],
    ['http://100.64.0.1/', 'CGNAT'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata cloud'],
    ['http://172.16.0.1/', '172.16/12'],
    ['http://172.31.255.255/', '172.16/12 cuối dải'],
    ['http://192.0.0.8/', '192.0.0/24'],
    ['http://192.0.2.1/', 'TEST-NET-1'],
    ['http://192.168.1.1/', '192.168/16'],
    ['http://198.18.0.1/', 'benchmark'],
    ['http://198.51.100.7/', 'TEST-NET-2'],
    ['http://203.0.113.9/', 'TEST-NET-3'],
    ['http://224.0.0.1/', 'multicast'],
    ['http://240.0.0.1/', 'dành riêng'],
    ['http://255.255.255.255/', 'broadcast'],
  ])('chặn %s (%s)', async (url) => {
    await expectBlocked(assertPublicUrl(url));
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it.each([
    'http://[::1]/',
    'http://[::]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[::ffff:0:7f00:1]/',
    'http://[::127.0.0.1]/',
    'http://[::a00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[64:ff9b:1::1]/',
    'http://[2002:7f00:1::]/',
    'http://[2002:a00:1::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[fe80::1]/',
    'http://[fec0::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/',
    'http://[2001::1]/',
    'http://[100::1]/',
  ])('chặn IPv6 %s', async (url) => {
    await expectBlocked(assertPublicUrl(url));
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['http://8.8.8.8/', '8.8.8.8'],
    ['https://1.1.1.1:8443/x', '1.1.1.1'],
    ['http://172.32.0.1/', '172.32.0.1'],
    ['http://[2606:4700:4700::1111]/', '2606:4700:4700::1111'],
    ['http://[::ffff:8.8.8.8]/', '::ffff:808:808'],
    ['http://[64:ff9b::808:808]/', '64:ff9b::808:808'],
    ['http://[2002:808:808::1]/', '2002:808:808::1'],
  ])('cho phép IP công khai %s', async (url, address) => {
    const result = await assertPublicUrl(url);
    expect(result.addresses).toEqual([{ address, family: net.isIP(address) }]);
    expect(lookupSpy).not.toHaveBeenCalled();
  });
});

describe('assertPublicUrl — tên host và DNS', () => {
  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://api.localhost/',
    'http://printer.local/',
    'http://db.localdomain/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://host.docker.internal/',
    'http://router.home.arpa/',
    'http://redis:6379/',
    'http://uknow-campaign-backend:5001/',
    'http://metadata/',
  ])('chặn tên nội bộ %s mà không hỏi DNS', async (url) => {
    const lookupSpy = jest.spyOn(dns.promises, 'lookup');
    await expectBlocked(assertPublicUrl(url));
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it('chặn tên host phân giải ra IP nội bộ', async () => {
    const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expectBlocked(assertPublicUrl('https://evil.example.com/page'));
    expect(lookupSpy).toHaveBeenCalledWith('evil.example.com', { all: true, verbatim: true });
  });

  it('chặn khi CHỈ MỘT trong các địa chỉ là nội bộ', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '::ffff:169.254.169.254', family: 6 },
    ]);
    await expectBlocked(assertPublicUrl('https://mixed.example.com/'));
  });

  it('cho phép host công khai và trả về đúng các địa chỉ đã kiểm', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    const result = await assertPublicUrl('https://Example.COM./docs?q=1');
    expect(result.hostname).toBe('example.com');
    expect(result.url.href).toBe('https://example.com./docs?q=1');
    expect(result.addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it('lỗi DNS được ném nguyên vẹn (không phải lỗi SSRF)', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND nope.example.com'), { code: 'ENOTFOUND' });
    jest.spyOn(dns.promises, 'lookup').mockRejectedValue(dnsError);
    const promise = assertPublicUrl('https://nope.example.com/');
    await expect(promise).rejects.toBe(dnsError);
  });

  it.each([
    ['ftp://example.com/file', 'protocol'],
    ['file:///etc/passwd', 'protocol'],
    ['gopher://example.com:70/', 'protocol'],
    ['javascript:alert(1)', 'protocol'],
    ['http://user:pass@example.com/', 'userinfo'],
    ['not a url', 'invalid_url'],
  ])('chặn %s (%s)', async (url, reason) => {
    await expect(assertPublicUrl(url)).rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, reason });
  });
});

describe('ngoại lệ loopback cho dev/test', () => {
  it('không bao giờ mở ở production, kể cả khi có cờ/nơi gọi yêu cầu', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    expect(isLoopbackAllowed({ allowLoopback: true })).toBe(false);
    await expectBlocked(assertPublicUrl('http://127.0.0.1:8080/'));
    await expectBlocked(assertPublicHost('localhost'));
  });

  it('ngoài production: mặc định vẫn chặn; có cờ thì chỉ mở loopback', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SSRF_ALLOW_LOOPBACK;
    expect(isLoopbackAllowed()).toBe(false);
    await expectBlocked(assertPublicUrl('http://127.0.0.1:8080/'));

    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    expect(isLoopbackAllowed()).toBe(true);
    await expect(assertPublicUrl('http://127.0.0.1:8080/')).resolves.toMatchObject({ hostname: '127.0.0.1' });
    await expect(assertPublicUrl('http://[::1]/')).resolves.toMatchObject({ hostname: '::1' });
    // Các dải nội bộ khác vẫn bị chặn.
    await expectBlocked(assertPublicUrl('http://10.0.0.1/'));
    await expectBlocked(assertPublicUrl('http://169.254.169.254/'));
    await expectBlocked(assertPublicUrl('http://0.0.0.0/'));
    await expectBlocked(assertPublicUrl('http://redis/'));
  });

  it('isPublicIpAddress / isObviouslyNonPublicHost', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SSRF_ALLOW_LOOPBACK;
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('fe80::1%eth0')).toBe(false);
    expect(isPublicIpAddress('not-an-ip')).toBe(false);
    expect(isObviouslyNonPublicHost('10.0.0.1')).toBe(true);
    expect(isObviouslyNonPublicHost('[::1]')).toBe(true);
    expect(isObviouslyNonPublicHost('localhost')).toBe(true);
    expect(isObviouslyNonPublicHost('postfix')).toBe(true);
    expect(isObviouslyNonPublicHost('')).toBe(true);
    expect(isObviouslyNonPublicHost('smtp.gmail.com')).toBe(false);
    expect(isObviouslyNonPublicHost('74.125.24.108')).toBe(false);
  });
});

describe('createPinnedLookup — ghim địa chỉ đã kiểm', () => {
  const vetted = [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ];

  function callLookup(lookup, host, options) {
    return new Promise((resolve) => {
      lookup(host, options, (err, address, family) => resolve({ err, address, family }));
    });
  }

  it('trả địa chỉ đã kiểm mà không hỏi lại DNS (DNS đổi sau khi kiểm không có tác dụng)', async () => {
    const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const legacyLookupSpy = jest.spyOn(dns, 'lookup');
    const lookup = createPinnedLookup('example.com', vetted);

    await expect(callLookup(lookup, 'example.com', { all: true })).resolves.toEqual({
      err: null,
      address: vetted,
      family: undefined,
    });
    await expect(callLookup(lookup, 'EXAMPLE.com.', {})).resolves.toEqual({
      err: null,
      address: '93.184.216.34',
      family: 4,
    });
    await expect(callLookup(lookup, 'example.com', { family: 6 })).resolves.toEqual({
      err: null,
      address: '2606:2800:220:1:248:1893:25c8:1946',
      family: 6,
    });
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(legacyLookupSpy).not.toHaveBeenCalled();
  });

  it('từ chối phân giải host khác host đã kiểm', async () => {
    const lookup = createPinnedLookup('example.com', vetted);
    const { err } = await callLookup(lookup, 'internal.example.net', {});
    expect(isSsrfBlockedError(err)).toBe(true);
  });

  it('không có địa chỉ đúng họ → ENOTFOUND', async () => {
    const lookup = createPinnedLookup('v4only.example.com', [{ address: '93.184.216.34', family: 4 }]);
    const { err } = await callLookup(lookup, 'v4only.example.com', 6);
    expect(err).toMatchObject({ code: 'ENOTFOUND' });
  });
});

describe('safeHttpRequest (server cục bộ, mở loopback cho test)', () => {
  let server;
  let base;
  let port;
  let received;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, host: req.headers.host, body, headers: req.headers });
        const redirectTo = (location, status = 302) => {
          res.writeHead(status, { location });
          res.end();
        };
        switch (req.url) {
          case '/to-metadata': return redirectTo('http://169.254.169.254/latest/meta-data/');
          case '/to-private': return redirectTo('http://10.0.0.7:8080/admin');
          case '/to-internal-name': return redirectTo('http://metadata.google.internal/');
          case '/to-file': return redirectTo('file:///etc/passwd');
          case '/to-final-302': return redirectTo('/final');
          case '/to-final-307': return redirectTo('/final', 307);
          case '/loop': return redirectTo('/loop');
          case '/to-other-origin': return redirectTo(`http://localhost:${port}/final`);
          case '/big':
            res.writeHead(200, { 'content-type': 'text/plain' });
            return res.end('x'.repeat(4096));
          case '/gzip-bomb': {
            const payload = zlib.gzipSync(Buffer.alloc(2 * 1024 * 1024, 0x61));
            res.writeHead(200, { 'content-encoding': 'gzip' });
            return res.end(payload);
          }
          case '/gzip-ok': {
            res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/html' });
            return res.end(zlib.gzipSync('<p>xin chào</p>'));
          }
          case '/hang':
            return undefined;
          default:
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            return res.end(`ok ${req.method} ${body}`);
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
    process.env.NODE_ENV = 'test';
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
  });

  it('không có cờ loopback → chặn trước khi kết nối', async () => {
    delete process.env.SSRF_ALLOW_LOOPBACK;
    await expectBlocked(safeHttpRequest(`${base}/hello`));
    expect(received).toHaveLength(0);
  });

  it('GET thường: trả status/body/url', async () => {
    const res = await safeHttpRequest(`${base}/hello`);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('ok GET ');
    expect(res.url).toBe(`${base}/hello`);
    expect(res.redirected).toBe(false);
  });

  it.each([
    ['/to-metadata'],
    ['/to-private'],
    ['/to-internal-name'],
    ['/to-file'],
  ])('redirect %s tới địa chỉ nội bộ/scheme lạ → chặn', async (path) => {
    await expectBlocked(safeHttpRequest(`${base}${path}`));
    expect(received.map((r) => r.url)).toEqual([path]);
  });

  it('302 sau POST → GET không body (như trình duyệt)', async () => {
    const res = await safeHttpRequest(`${base}/to-final-302`, {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.redirected).toBe(true);
    expect(res.url).toBe(`${base}/final`);
    expect(received.map((r) => `${r.method} ${r.url} ${r.body}`)).toEqual([
      'POST /to-final-302 {"a":1}',
      'GET /final ',
    ]);
    expect(received[1].headers['content-type']).toBeUndefined();
  });

  it('307 giữ nguyên method và body', async () => {
    const res = await safeHttpRequest(`${base}/to-final-307`, { method: 'POST', body: 'giu-nguyen' });
    expect(res.body.toString()).toBe('ok POST giu-nguyen');
  });

  it('redirect sang origin khác thì bỏ Authorization/Cookie', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await safeHttpRequest(`${base}/to-other-origin`, {
      headers: { Authorization: 'Bearer secret', Cookie: 'sid=1', 'X-Keep': 'yes' },
    });
    expect(received[0].headers.authorization).toBe('Bearer secret');
    expect(received[1].headers.authorization).toBeUndefined();
    expect(received[1].headers.cookie).toBeUndefined();
    expect(received[1].headers['x-keep']).toBe('yes');
    expect(received[1].host).toBe(`localhost:${port}`);
  });

  it('quá số redirect → lỗi TOO_MANY_REDIRECTS', async () => {
    await expect(safeHttpRequest(`${base}/loop`, { maxRedirects: 3 }))
      .rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
    expect(received).toHaveLength(4);
  });

  it('maxRedirects: 0 → trả nguyên phản hồi 3xx', async () => {
    const res = await safeHttpRequest(`${base}/to-metadata`, { maxRedirects: 0 });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://169.254.169.254/latest/meta-data/');
  });

  it('giới hạn kích thước phản hồi (kể cả sau giải nén)', async () => {
    await expect(safeHttpRequest(`${base}/big`, { maxBytes: 1024 }))
      .rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    await expect(safeHttpRequest(`${base}/gzip-bomb`, { maxBytes: 64 * 1024 }))
      .rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    const ok = await safeHttpRequest(`${base}/gzip-ok`);
    expect(ok.body.toString()).toBe('<p>xin chào</p>');
  });

  it('timeout tổng', async () => {
    await expect(safeHttpRequest(`${base}/hang`, { timeoutMs: 200 }))
      .rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('DNS rebinding: kết nối ghim vào IP đã kiểm, không phân giải lại; Host giữ tên gốc', async () => {
    const lookupSpy = jest.spyOn(dns.promises, 'lookup')
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockResolvedValue([{ address: '10.0.0.9', family: 4 }]);
    const legacyLookupSpy = jest.spyOn(dns, 'lookup');

    const res = await safeHttpRequest(`http://rebind.example.test:${port}/pinned`);

    expect(res.status).toBe(200);
    expect(lookupSpy).toHaveBeenCalledTimes(1);
    expect(legacyLookupSpy).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
    expect(received[0].host).toBe(`rebind.example.test:${port}`);
  });

  it('safeFetch: giao diện giống fetch', async () => {
    const res = await safeFetch(`${base}/to-final-302`, { headers: { Accept: 'text/html' } });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.redirected).toBe(true);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    await expect(res.text()).resolves.toBe('ok GET ');
  });
});

describe('connectToPublicHost (TCP cho SMTP...)', () => {
  let tcpServer;
  let tcpPort;

  beforeAll(async () => {
    tcpServer = net.createServer((socket) => socket.end('220 ok\r\n'));
    await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
    tcpPort = tcpServer.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => tcpServer.close(resolve));
  });

  it('chặn host phân giải ra IP nội bộ, không mở kết nối', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '192.168.1.20', family: 4 }]);
    const connectSpy = jest.spyOn(net, 'connect');
    await expectBlocked(connectToPublicHost('smtp.attacker.example', 25));
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('kết nối tới đúng IP đã kiểm (loopback mở cho test)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const socket = await connectToPublicHost('smtp.example.test', tcpPort, { connectTimeoutMs: 2000 });
    expect(socket.remoteAddress).toBe('127.0.0.1');
    const greeting = await new Promise((resolve) => socket.once('data', (chunk) => resolve(chunk.toString())));
    expect(greeting).toBe('220 ok\r\n');
    socket.destroy();
  });
});
