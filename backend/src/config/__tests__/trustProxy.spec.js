import { describe, expect, it } from '@jest/globals';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyTrustProxy, CLOUDFLARE_IP_RANGES } from '../cloudflareIpRanges.js';

// PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 PR-D — production 29/09: login_history ghi toàn IP máy Cloudflare vì
// `trust proxy 1` mà X-Forwarded-For có ≥ 2 chặng. Thử trên app express TRỐNG (không nạp createApp) và đọc
// `req.ip` bằng CHÍNH getter của express — không tự gọi proxy-addr (phụ thuộc bắc cầu, không khai báo).
const app = express();
applyTrustProxy(app, { TRUST_PROXY: 'true' });

function ipFor(remoteAddress, xff) {
  const req = Object.create(app.request);
  req.headers = xff ? { 'x-forwarded-for': xff } : {};
  req.socket = { remoteAddress };
  req.connection = req.socket;
  return req.ip;
}

describe('trust proxy sau Cloudflare (PR-D)', () => {
  it('(a) 1 chặng Cloudflare → IP người dùng', () => {
    expect(ipFor('162.158.1.1', '203.0.113.5')).toBe('203.0.113.5');
  });

  it('(b) 2 chặng Cloudflare → IP người dùng', () => {
    expect(ipFor('162.158.1.1', '203.0.113.5, 172.68.211.24')).toBe('203.0.113.5');
  });

  it('(c) gọi thẳng :5001 (không phải Cloudflare) → header giả bị bỏ qua', () => {
    expect(ipFor('198.51.100.7', '1.2.3.4')).toBe('198.51.100.7');
  });

  it('(d) docker bridge + Cloudflare → IP người dùng', () => {
    expect(ipFor('172.17.0.1', '203.0.113.5, 162.158.1.1')).toBe('203.0.113.5');
  });

  it('(e) IPv6 Cloudflare → IP người dùng IPv6', () => {
    expect(ipFor('2606:4700::1', '2001:db8::5')).toBe('2001:db8::5');
  });

  it('danh sách ghim hai dải thấy trên production', () => {
    expect(CLOUDFLARE_IP_RANGES).toContain('162.158.0.0/15');
    expect(CLOUDFLARE_IP_RANGES).toContain('172.64.0.0/13');
  });

  it('không bật khi không production và không TRUST_PROXY (máy dev giữ nguyên hành vi)', () => {
    const plain = express();
    applyTrustProxy(plain, { NODE_ENV: 'development' });
    expect(plain.get('trust proxy')).toBe(false);
  });

  it('app.js gọi applyTrustProxy(app) và không còn đặt trust proxy bằng tay', () => {
    const src = readFileSync(fileURLToPath(new URL('../../app.js', import.meta.url)), 'utf8');
    expect(src).toContain('applyTrustProxy(app);');
    expect(src).not.toMatch(/app\.set\(\s*['"]trust proxy['"]/);
  });
});
