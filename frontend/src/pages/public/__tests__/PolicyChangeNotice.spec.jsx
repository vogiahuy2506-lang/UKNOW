import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Support from '../Support.jsx';
import PaymentPolicy from '../PaymentPolicy.jsx';
import ComplaintPolicy from '../ComplaintPolicy.jsx';
import TermsOfService from '../TermsOfService.jsx';
import PrivacyPolicy from '../PrivacyPolicy.jsx';
import PublicDPA from '../PublicDPA.jsx';
import PricingPolicy from '../PricingPolicy.jsx';
import ServiceTerms from '../ServiceTerms.jsx';
import ServiceDeliveryPolicy from '../ServiceDeliveryPolicy.jsx';
import RefundPolicy from '../RefundPolicy.jsx';
import RightsAndDuties from '../RightsAndDuties.jsx';

/**
 * Thông báo đổi giờ hỗ trợ (đăng 04/10/2026, hiệu lực 19/10/2026) chỉ được hiện ở ba trang còn ghi giờ hotline cũ.
 * Plan: _internal/PLAN_GIO_HO_TRO_THONG_BAO_19_10_2026-10-04.md. Tới hết 18/10/2026 văn bản 8:00 - 22:00 vẫn hiện hành.
 */
const norm = (s) => s.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();

const NOTICE_PAGES = [
  ['/support', Support],
  ['/payment-policy', PaymentPolicy],
  ['/complaint-policy', ComplaintPolicy],
];

const OTHER_PAGES = [
  ['/terms', TermsOfService],
  ['/privacy-policy', PrivacyPolicy],
  ['/public-dpa', PublicDPA],
  ['/pricing-policy', PricingPolicy],
  ['/service-terms', ServiceTerms],
  ['/service-delivery-policy', ServiceDeliveryPolicy],
  ['/refund-policy', RefundPolicy],
  ['/rights-and-duties', RightsAndDuties],
];

const renderPage = (path, Component) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Component />
    </MemoryRouter>,
  );

/** Chữ của đoạn đang hiện (đoạn ngôn ngữ kia mang class `hidden`). */
const visibleNoticeText = (container) => {
  const notices = container.querySelectorAll('[data-policy-change-notice]');
  expect(notices).toHaveLength(1);
  return [...notices[0].querySelectorAll('p')]
    .filter((p) => !p.className.includes('hidden'))
    .map((p) => norm(p.textContent))
    .join(' ');
};

describe.each(NOTICE_PAGES)('trang %s — thông báo đổi giờ hỗ trợ', (path, Component) => {
  it('VI: có thông báo đăng 04/10/2026, hiệu lực 19/10/2026, giờ mới 8:30 – 17:00 Thứ 2 – Thứ 6, giờ cũ vẫn áp dụng tới hết 18/10/2026', () => {
    const { container } = renderPage(path, Component);
    const text = visibleNoticeText(container);
    expect(text).toContain('Thông báo thay đổi giờ hỗ trợ');
    expect(text).toContain('đăng ngày 04/10/2026');
    expect(text).toContain('Từ ngày 19/10/2026');
    expect(text).toContain('Thứ 2 – Thứ 6, 8:30 – 17:00');
    expect(text).toContain('(giờ Việt Nam)');
    expect(text).toContain('thay cho 8:00 – 22:00, Thứ 2 – Thứ 7');
    expect(text).toContain('Đến hết ngày 18/10/2026, giờ hỗ trợ hiện hành vẫn được áp dụng.');
  });

  it('EN: bấm English thì hiện bản tiếng Anh (ngày viết "October 19, 2026" như phần còn lại của trang)', () => {
    const { container } = renderPage(path, Component);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    const text = visibleNoticeText(container);
    expect(text).toContain('Notice of change to support hours');
    expect(text).toContain('posted October 4, 2026');
    expect(text).toContain('From October 19, 2026');
    expect(text).toContain('Monday – Friday, 8:30 AM – 5:00 PM');
    expect(text).toContain('(Vietnam time)');
    expect(text).toContain('replacing 8:00 AM – 10:00 PM, Monday – Saturday');
    expect(text).toContain('Until the end of October 18, 2026, the current support hours continue to apply.');
  });

  it('nằm NGAY DƯỚI dòng "Cập nhật ngày … — Áp dụng từ …"; dòng đó vẫn là 29/09/2026 (chưa đổi điều khoản)', () => {
    const { container } = renderPage(path, Component);
    const notice = container.querySelector('[data-policy-change-notice]');
    expect(norm(notice.previousElementSibling.textContent)).toContain('Cập nhật ngày 29/09/2026 — Áp dụng từ 29/09/2026');
  });

  it('thông báo không thay điều khoản: thân trang vẫn ghi hotline cũ 8:00 - 22:00, Thứ 2 - Thứ 7 (hiện hành tới hết 18/10/2026)', () => {
    const { container } = renderPage(path, Component);
    const body = norm(container.textContent);
    expect(body).toContain('8:00 - 22:00, Thứ 2 - Thứ 7');
    expect(body).not.toContain('Thứ 2 - Thứ 6');
  });
});

describe.each(OTHER_PAGES)('trang %s — không có thông báo đổi giờ hỗ trợ', (path, Component) => {
  it('không render khung thông báo (chỉ Support / Payment / Complaint mới ghi giờ hotline)', () => {
    const { container } = renderPage(path, Component);
    expect(container.querySelector('[data-policy-change-notice]')).toBeNull();
    expect(norm(container.textContent)).not.toContain('Thông báo thay đổi giờ hỗ trợ');
  });
});
