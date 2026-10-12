/**
 * 12/10/2026 — nút "Trải nghiệm miễn phí" (heroPage.heroCtaPrimary) ở trang chủ phải dẫn thẳng vào /app
 * (chưa đăng nhập thì ProtectedRoute tự đưa về đăng nhập). Trước đó hero trỏ /trial-demo và thanh điều
 * hướng trỏ /register. Test khoá cả 3 nơi: hero, thanh điều hướng desktop, menu di động.
 * Route /trial-demo vẫn giữ (quảng cáo cũ có thể còn link) — test này chỉ khoá nút.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
// Các khối nặng của trang chủ không liên quan tới nút CTA
vi.mock('../components/HeroDashboardMock', () => ({ default: () => null }));
vi.mock('../components/CampaignFlowLauncher', () => ({ default: () => null }));
vi.mock('../components/PublicFooter', () => ({ default: () => null }));
vi.mock('../../../features/hero/components/HeroChatWidget', () => ({ default: () => null }));
vi.mock('../../../features/hero/components/CampaignFlowModal', () => ({ default: () => null }));
vi.mock('../../../features/landing-customizer', () => ({
  usePublicLandingOverrides: () => ({ getOverride: (_key, fallback) => fallback }),
}));

const { default: HeroNavbar } = await import('../components/HeroNavbar');
const { default: HeroPage } = await import('../HeroPage');

const CTA = 'Trải nghiệm miễn phí';
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeAll(() => {
  window.scrollTo = vi.fn();
  // AnimatedSection (các khối bên dưới hero) dùng IntersectionObserver, jsdom không có
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
});

describe('nút "Trải nghiệm miễn phí" trang chủ → /app', () => {
  it('thanh điều hướng (desktop): href /app', () => {
    wrap(<HeroNavbar />);
    const links = screen.getAllByRole('link', { name: new RegExp(CTA) });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/app');
  });

  it('menu di động (sau khi mở hamburger): cả hai nút nhãn Trải nghiệm miễn phí đều href /app', () => {
    wrap(<HeroNavbar />);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.className.includes('md:hidden')));
    const links = screen.getAllByRole('link', { name: new RegExp(CTA) });
    expect(links).toHaveLength(2);
    links.forEach((a) => expect(a).toHaveAttribute('href', '/app'));
  });

  it('hero: nút chính mang data-edit="cta.button" href /app, không còn trỏ /trial-demo', () => {
    const { container } = wrap(<HeroPage />);
    const cta = container.querySelector('[data-edit="cta.button"]');
    expect(cta).not.toBeNull();
    expect(cta).toHaveTextContent(CTA);
    expect(cta).toHaveAttribute('href', '/app');
    expect(container.querySelector('a[href="/trial-demo"]')).toBeNull();
  });
});
