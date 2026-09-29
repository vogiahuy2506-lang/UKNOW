import { describe, expect, it } from '@jest/globals';
import proxyaddr from 'proxy-addr';
import { createApp } from '../../app.js';
import { CLOUDFLARE_IP_RANGES } from '../cloudflareIpRanges.js';

// Dùng createApp() thật để đột biến ở app.js bị bắt.
function buildTrustFn() {
  const prev = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = 'true';
  try {
    return createApp().get('trust proxy fn');
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  }
}

function resolveIp(trustFn, remoteAddress, xff) {
  const req = {
    headers: { 'x-forwarded-for': xff },
    socket: { remoteAddress },
    connection: { remoteAddress },
  };
  return proxyaddr(req, trustFn);
}

describe('trust proxy sau Cloudflare', () => {
  const trustFn = buildTrustFn();

  it('(a) 1 chặng Cloudflare → IP người dùng', () => {
    expect(resolveIp(trustFn, '162.158.1.1', '203.0.113.5')).toBe('203.0.113.5');
  });

  it('(b) 2 chặng Cloudflare → IP người dùng', () => {
    expect(resolveIp(trustFn, '162.158.1.1', '203.0.113.5, 172.68.211.24')).toBe('203.0.113.5');
  });

  it('(c) gọi thẳng :5001 (không phải Cloudflare) → header giả bị bỏ qua', () => {
    expect(resolveIp(trustFn, '198.51.100.7', '1.2.3.4')).toBe('198.51.100.7');
  });

  it('(d) docker bridge + Cloudflare → IP người dùng', () => {
    expect(resolveIp(trustFn, '172.17.0.1', '203.0.113.5, 162.158.1.1')).toBe('203.0.113.5');
  });

  it('(e) IPv6 Cloudflare → IP người dùng IPv6', () => {
    expect(resolveIp(trustFn, '2606:4700::1', '2001:db8::5')).toBe('2001:db8::5');
  });

  it('danh sách ghim hai dải thấy trên production', () => {
    expect(CLOUDFLARE_IP_RANGES).toContain('162.158.0.0/15');
    expect(CLOUDFLARE_IP_RANGES).toContain('172.64.0.0/13');
  });
});
