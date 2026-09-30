import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import Footer from '../../../components/layout/client/Footer.jsx';
import PublicFooter from '../components/PublicFooter.jsx';
import { POLICY_LINKS_VI } from './policyFooterLabels.js';
import { isPathExcludedFromPostAuthGates } from '../../../features/auth/components/PostAuthGateModals.jsx';

function renderWith(node) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe.each([
  ['Footer (client)', Footer],
  ['PublicFooter', PublicFooter],
])('%s — 11 chính sách công khai', (_name, Component) => {
  it('có đủ 11 link chính sách, đúng nhãn từng chữ và đúng đường dẫn', () => {
    renderWith(<Component />);
    const column = screen.getByRole('heading', { name: 'Chính sách' }).parentElement;
    const links = within(column).getAllByRole('link');
    expect(links).toHaveLength(POLICY_LINKS_VI.length);
    for (const [href, label] of POLICY_LINKS_VI) {
      const link = within(column).getByRole('link', { name: label });
      expect(link.getAttribute('href'), `nhãn "${label}"`).toBe(href);
    }
  });

  it('có link tới Chính sách về phương thức cung cấp dịch vụ (/service-delivery-policy)', () => {
    const { container } = renderWith(<Component />);
    expect(container.querySelector('a[href="/service-delivery-policy"]')).not.toBeNull();
  });
});

// Modal cổng sau đăng nhập (SĐT/đồng ý) gắn toàn cục; người đang bị chặn phải đọc được
// mọi trang chính sách mà không bị modal đè lên — từng thiếu /rights-and-duties.
describe('11 route chính sách được miễn cổng sau đăng nhập', () => {
  it.each(POLICY_LINKS_VI)('%s', (href) => {
    expect(isPathExcludedFromPostAuthGates(href)).toBe(true);
    expect(isPathExcludedFromPostAuthGates(`${href}/`)).toBe(true);
  });

  it('trang xem phiên bản lưu trữ /policy-versions/... cũng được miễn cổng', () => {
    expect(isPathExcludedFromPostAuthGates('/policy-versions/terms/2026-09-29')).toBe(true);
  });
});
