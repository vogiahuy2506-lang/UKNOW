/**
 * URL gửi sang Google Analytics không được mang bí mật: token đặt lại mật khẩu / kích hoạt, mã
 * mời, code/state/access_token của OAuth, mã truy cập trong đường dẫn, PII (email…). Tham số
 * marketing (utm_*) và tham số thường vẫn giữ nguyên văn.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sanitizeAnalyticsUrl } from '../analytics';

describe('sanitizeAnalyticsUrl', () => {
  it('bỏ token/invite/code/state… khỏi path + query, giữ utm_* và tham số thường', () => {
    expect(sanitizeAnalyticsUrl('/reset-password?token=abc123')).toBe('/reset-password');
    expect(sanitizeAnalyticsUrl('/activate?token=abc&utm_source=email')).toBe('/activate?utm_source=email');
    expect(
      sanitizeAnalyticsUrl('/register?invite=inv-1&email=a%40b.com&utm_campaign=launch&utm_medium=cpc')
    ).toBe('/register?utm_campaign=launch&utm_medium=cpc');
    expect(sanitizeAnalyticsUrl('/oauth/callback?code=c0de&state=st4te&tab=zalo')).toBe('/oauth/callback?tab=zalo');
    expect(sanitizeAnalyticsUrl('/pricing?plan=pro&utm_source=fb')).toBe('/pricing?plan=pro&utm_source=fb');
  });

  it('khớp tên không phân biệt hoa thường, cả tên đã mã hoá và tên chứa token/secret', () => {
    const cases = [
      'access_token=1', 'id_token=1', 'refresh_token=1', 'otp=1', 'key=1', 'secret=1', 'signature=1',
      'sig=1', 'TOKEN=1', 'Invite=1', '%74oken=1', 'reset_token=1', 'inviteToken=1', 'client_secret=1',
      'X-Amz-Signature=1', 'password=1', 'username=u',
    ];
    for (const pair of cases) {
      expect(sanitizeAnalyticsUrl(`/x?${pair}&utm_source=a`)).toBe('/x?utm_source=a');
    }
  });

  it('URL tuyệt đối: lọc query, bỏ fragment mang token, giữ fragment thường', () => {
    expect(
      sanitizeAnalyticsUrl('https://founderai.biz/auth/cb?code=x&utm_source=g#access_token=t0k&token_type=bearer')
    ).toBe('https://founderai.biz/auth/cb?utm_source=g');
    expect(sanitizeAnalyticsUrl('https://founderai.biz/app/settings/channels#zalo')).toBe(
      'https://founderai.biz/app/settings/channels#zalo'
    );
    expect(sanitizeAnalyticsUrl('https://founderai.biz/cb#state=abc&code=xyz')).toBe('https://founderai.biz/cb');
    expect(sanitizeAnalyticsUrl('https://user:pass@founderai.biz/a')).toBe('https://founderai.biz/a');
  });

  it('thay mã truy cập trong đường dẫn trang trạng thái phiếu đăng ký', () => {
    expect(sanitizeAnalyticsUrl('/f/pubKey1/s/secretAccess123')).toBe('/f/pubKey1/s/:accessToken');
    expect(sanitizeAnalyticsUrl('https://founderai.biz/f/pubKey1/s/secretAccess123?utm_source=zalo')).toBe(
      'https://founderai.biz/f/pubKey1/s/:accessToken?utm_source=zalo'
    );
    expect(sanitizeAnalyticsUrl('/f/pubKey1')).toBe('/f/pubKey1');
  });

  it('không có gì nhạy cảm → giữ nguyên văn (kể cả cách mã hoá)', () => {
    const url = 'https://founderai.biz/huong-dan/bat-dau?q=a%20b&utm_term=x+y#muc-2';
    expect(sanitizeAnalyticsUrl(url)).toBe(url);
    expect(sanitizeAnalyticsUrl('')).toBe('');
    expect(sanitizeAnalyticsUrl(undefined)).toBe('');
  });
});

describe('initAnalytics / trackPageView / RouteAnalytics — dữ liệu thật gửi vào dataLayer', () => {
  const SECRET_PATH = '/reset-password?token=abc123secret&utm_source=email#access_token=frag456secret';

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('VITE_PRIMARY_APP_HOSTS', '');
    window.dataLayer = [];
    window.history.pushState({}, '', SECRET_PATH);
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: () => 'http://localhost:3000/activate?token=ref789secret&utm_medium=mail',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete document.referrer;
    delete window.dataLayer;
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove());
    window.history.pushState({}, '', '/');
  });

  const sentPayload = () => JSON.stringify(window.dataLayer.map((entry) => Array.from(entry)));

  it('page_location, page_path, page_referrer đã lọc; giá trị chung được set trước config', async () => {
    const { initAnalytics, trackPageView } = await import('../analytics');
    initAnalytics();
    trackPageView('/reset-password?token=abc123secret&utm_source=email');

    const payload = sentPayload();
    expect(payload).not.toMatch(/abc123secret|frag456secret|ref789secret/);
    expect(payload).toContain('utm_source=email');
    expect(payload).toContain('utm_medium=mail');

    const commands = window.dataLayer.map((entry) => Array.from(entry));
    const setIndex = commands.findIndex(([cmd]) => cmd === 'set');
    const configIndex = commands.findIndex(([cmd]) => cmd === 'config');
    expect(setIndex).toBeGreaterThan(-1);
    expect(setIndex).toBeLessThan(configIndex);
    expect(commands[configIndex][2]).toMatchObject({
      send_page_view: false,
      page_location: 'http://localhost:3000/reset-password?utm_source=email',
      page_referrer: 'http://localhost:3000/activate?utm_medium=mail',
    });

    const pageView = commands.find(([cmd, name]) => cmd === 'event' && name === 'page_view');
    expect(pageView[2]).toMatchObject({
      page_path: '/reset-password?utm_source=email',
      page_location: 'http://localhost:3000/reset-password?utm_source=email',
    });
  });

  it('referrer không có gì nhạy cảm → không ghi đè page_referrer', async () => {
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => 'https://www.google.com/' });
    const { initAnalytics } = await import('../analytics');
    initAnalytics();

    const config = window.dataLayer.map((entry) => Array.from(entry)).find(([cmd]) => cmd === 'config');
    expect(config[2]).not.toHaveProperty('page_referrer');
    expect(config[2].page_location).toBe('http://localhost:3000/reset-password?utm_source=email');
  });

  it('RouteAnalytics gửi page_path đã lọc cho route có mã mời', async () => {
    const { default: RouteAnalytics } = await import('../../components/RouteAnalytics');
    render(
      <MemoryRouter
        initialEntries={['/register?invite=inv999secret&email=a%40b.com&utm_campaign=launch']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <RouteAnalytics />
      </MemoryRouter>
    );

    const payload = sentPayload();
    expect(payload).not.toMatch(/inv999secret|a%40b\.com|abc123secret|frag456secret/);
    const pageView = window.dataLayer
      .map((entry) => Array.from(entry))
      .find(([cmd, name]) => cmd === 'event' && name === 'page_view');
    expect(pageView[2].page_path).toBe('/register?utm_campaign=launch');
  });
});
