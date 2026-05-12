import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildLandingTrackGoUrl } from '../buildLandingTrackGoUrl';

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', '/api');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildLandingTrackGoUrl', () => {
  it('happy path: slug + target → query string đúng', () => {
    const url = buildLandingTrackGoUrl('khoahoc', 'https://example.com/page?x=1');
    expect(url).toBe(
      '/api/public/landing-track/go?slug=khoahoc&u=' +
        encodeURIComponent('https://example.com/page?x=1')
    );
  });

  it('slug được lowercase + trim', () => {
    const url = buildLandingTrackGoUrl('  AI  ', 'https://example.com');
    expect(url).toContain('slug=ai');
  });

  it('targetUrl được encodeURIComponent toàn bộ', () => {
    const url = buildLandingTrackGoUrl('l', 'https://x.com/path?a=b c&d=e');
    expect(url).toContain('u=' + encodeURIComponent('https://x.com/path?a=b c&d=e'));
  });

  it('VITE_API_URL trùng /api/api → tự gộp về /api', () => {
    vi.stubEnv('VITE_API_URL', 'https://server.com/api/api');
    const url = buildLandingTrackGoUrl('l', 'https://x.com');
    expect(url).toMatch(/^https:\/\/server\.com\/api\/public\/landing-track\/go/);
    expect(url).not.toMatch(/\/api\/api\//);
  });

  it('slug/target null hoặc undefined → encode chuỗi rỗng (không throw)', () => {
    const url = buildLandingTrackGoUrl(null, undefined);
    expect(url).toBe('/api/public/landing-track/go?slug=&u=');
  });
});
