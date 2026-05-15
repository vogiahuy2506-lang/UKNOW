import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isPrimaryAppHostname } from '../isPrimaryAppHost';

describe('isPrimaryAppHostname', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('trả về true khi hostname rỗng', () => {
    expect(isPrimaryAppHostname('')).toBe(true);
    expect(isPrimaryAppHostname(null)).toBe(true);
  });

  it('mặc định nhận localhost và 127.0.0.1 khi không có env', () => {
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', '');
    expect(isPrimaryAppHostname('localhost')).toBe(true);
    expect(isPrimaryAppHostname('127.0.0.1')).toBe(true);
  });

  it('trả về false cho custom domain khi không có trong env', () => {
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', '');
    expect(isPrimaryAppHostname('founderai.biz')).toBe(false);
  });

  it('nhận host được khai báo trong VITE_PRIMARY_APP_HOSTS', () => {
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', 'founderai.biz,www.founderai.biz');
    expect(isPrimaryAppHostname('founderai.biz')).toBe(true);
    expect(isPrimaryAppHostname('www.founderai.biz')).toBe(true);
  });

  it('không nhận host không có trong VITE_PRIMARY_APP_HOSTS', () => {
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', 'founderai.biz');
    expect(isPrimaryAppHostname('other.com')).toBe(false);
  });

  it('không phân biệt hoa thường', () => {
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', 'founderai.biz');
    expect(isPrimaryAppHostname('FOUNDERAI.BIZ')).toBe(true);
  });
});
