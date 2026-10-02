import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import http from 'node:http';
import { appendLeadToGoogleSheet, extractGoogleSheetsSyncConfig } from '../googleSheetsAppend.util.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx123/exec';

const syncConfig = (webhookUrl, extra = {}) => ({ googleSheetsSync: { enabled: true, webhookUrl, ...extra } });

afterEach(() => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('extractGoogleSheetsSyncConfig', () => {
  it('nhận URL https của Google Apps Script', () => {
    expect(extractGoogleSheetsSyncConfig(syncConfig(GAS_URL, { sheetName: 'Leads' })))
      .toEqual({ webhookUrl: GAS_URL, sheetName: 'Leads' });
  });

  it.each([
    'http://script.google.com/macros/s/x/exec',
    'ftp://example.com/hook',
    'https://user:pass@script.google.com/macros/s/x/exec',
    'khong-phai-url',
  ])('từ chối %s', (url) => {
    expect(extractGoogleSheetsSyncConfig(syncConfig(url))).toBeNull();
  });

  it('http://localhost chỉ được dùng ngoài production', () => {
    process.env.NODE_ENV = 'production';
    expect(extractGoogleSheetsSyncConfig(syncConfig('http://localhost:3000/hook'))).toBeNull();
    expect(extractGoogleSheetsSyncConfig(syncConfig('http://127.0.0.1:5001/api/x'))).toBeNull();

    process.env.NODE_ENV = 'development';
    expect(extractGoogleSheetsSyncConfig(syncConfig('http://localhost:3000/hook')))
      .toEqual({ webhookUrl: 'http://localhost:3000/hook', sheetName: undefined });
  });
});

describe('appendLeadToGoogleSheet — chống SSRF', () => {
  let server;
  let port;
  let received;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body });
        if (req.url === '/exec') {
          // Giống GAS: doPost chạy rồi 302 sang trang kết quả.
          res.writeHead(302, { location: '/echo?ok=1' });
          res.end();
          return;
        }
        if (req.url === '/exec-to-metadata') {
          res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"result":"ok"}');
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
  });

  it.each([
    'https://10.0.0.5/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/hook',
  ])('URL nội bộ %s → ok:false, không gửi', async (webhookUrl) => {
    const result = await appendLeadToGoogleSheet({ webhookUrl }, { email: 'a@b.c' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nội bộ/);
  });

  it('host https phân giải ra IP nội bộ → ok:false', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '172.20.0.3', family: 4 }]);
    const result = await appendLeadToGoogleSheet({ webhookUrl: 'https://sheets.attacker.example/hook' }, {});
    expect(result).toMatchObject({ ok: false });
  });

  it('localhost (http) ở production → bị từ chối, không gửi', async () => {
    process.env.NODE_ENV = 'production';
    const result = await appendLeadToGoogleSheet({ webhookUrl: `http://127.0.0.1:${port}/exec` }, {});
    expect(result.ok).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('dev: POST JSON tới webhook cục bộ, theo 302 bằng GET như GAS', async () => {
    process.env.NODE_ENV = 'development';
    const result = await appendLeadToGoogleSheet(
      { webhookUrl: `http://127.0.0.1:${port}/exec`, sheetName: 'Leads' },
      { email: 'khach@example.com', fullName: 'Nguyễn Văn A' }
    );
    expect(result).toEqual({ ok: true, status: 200 });
    expect(received.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /exec', 'GET /echo?ok=1']);
    expect(JSON.parse(received[0].body)).toEqual({
      email: 'khach@example.com',
      fullName: 'Nguyễn Văn A',
      sheetName: 'Leads',
    });
  });

  it('dev: redirect tới địa chỉ nội bộ khác loopback vẫn bị chặn', async () => {
    process.env.NODE_ENV = 'development';
    const result = await appendLeadToGoogleSheet({ webhookUrl: `http://127.0.0.1:${port}/exec-to-metadata` }, {});
    expect(result.ok).toBe(false);
    expect(received.map((r) => r.url)).toEqual(['/exec-to-metadata']);
  });
});
