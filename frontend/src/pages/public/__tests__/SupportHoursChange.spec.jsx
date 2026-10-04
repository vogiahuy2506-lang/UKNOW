import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
import PolicyArchivedVersionPage from '../PolicyArchivedVersionPage.jsx';
import { POLICY_VERSIONS } from '../policyVersions.js';

/**
 * Giờ hỗ trợ hotline mới: Thứ 2 – Thứ 6, 8:30 – 17:00 (giờ Việt Nam), thông báo 04/10/2026, hiệu lực 19/10/2026, ở ba trang
 * Support / PaymentPolicy / ComplaintPolicy. Văn bản 29/09/2026 (8:00 - 22:00, Thứ 2 - Thứ 7) được lưu ở
 * `policyArchive/<slug>/2026-09-29/`. Plan: _internal/PLAN_GIO_HO_TRO_THONG_BAO_19_10_2026-10-04.md.
 */
const norm = (s) => s.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();

// [slug, path, Component, câu giờ VI mới, câu giờ EN mới, câu giờ VI cũ, câu giờ EN cũ]
const PAGES = [
  [
    'support', '/support', Support,
    'Hotline: 8:30 - 17:00, Thứ 2 - Thứ 6.',
    'Hotline: 8:30 AM - 5:00 PM, Monday - Friday.',
    'Hotline: 8:00 - 22:00, Thứ 2 - Thứ 7.',
    'Hotline: 8:00 AM - 10:00 PM, Monday - Saturday.',
  ],
  [
    'payment', '/payment-policy', PaymentPolicy,
    'Hotline hỗ trợ: 0877909606 (8:30 - 17:00, Thứ 2 - Thứ 6).',
    'Support hotline: 0877909606 (8:30 AM - 5:00 PM, Monday - Friday).',
    'Hotline hỗ trợ: 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7).',
    'Support hotline: 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday).',
  ],
  [
    'complaint', '/complaint-policy', ComplaintPolicy,
    'Điện thoại: 0877909606 (8:30 - 17:00, Thứ 2 - Thứ 6)',
    'Phone: 0877909606 (8:30 AM - 5:00 PM, Monday - Friday)',
    'Điện thoại: 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7)',
    'Phone: 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday)',
  ],
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

describe.each(PAGES)('trang %s (%s) — giờ hỗ trợ mới có hiệu lực 19/10/2026', (slug, path, Component, viNew, enNew, viOld, enOld) => {
  it('ghi giờ mới 8:30 - 17:00 Thứ 2 - Thứ 6 (VI + EN), không còn giờ cũ 8:00 - 22:00 / Thứ 7 / Saturday', () => {
    const { container } = renderPage(path, Component);
    const text = norm(container.textContent);
    expect(text).toContain(viNew);
    expect(text).toContain(enNew);
    expect(text).not.toContain(viOld);
    expect(text).not.toContain(enOld);
    for (const old of ['22:00', '10:00 PM', 'Thứ 7', 'Saturday', '8:00 - ', '8:00 AM']) {
      expect(text, `còn dấu vết giờ cũ "${old}"`).not.toContain(old);
    }
  });

  it('dòng "Cập nhật ngày 04/10/2026 — Áp dụng từ 19/10/2026" + chân trang 19/10/2026 (VI + EN), không còn ngày 29/09/2026 ngoài khối lịch sử', () => {
    const { container } = renderPage(path, Component);
    // Khối "Lịch sử cập nhật" liệt kê 29/09/2026 một cách chính đáng → bỏ ra trước khi dò dấu vết ngày cũ.
    const body = container.cloneNode(true);
    body.querySelector('[data-policy-history]').remove();
    const text = norm(body.textContent);
    expect(text).toContain('Cập nhật ngày 04/10/2026 — Áp dụng từ 19/10/2026');
    expect(text).toContain('Last updated on October 4, 2026 — Effective from October 19, 2026');
    expect(text).toContain('Chính sách này được cập nhật và có hiệu lực từ ngày 19/10/2026.');
    expect(text).toContain('This policy was last updated and effective from October 19, 2026.');
    expect(text).not.toContain('29/09/2026');
    expect(text).not.toContain('September 29, 2026');
  });

  it('khung thông báo đổi giờ đã gỡ khỏi trang hiện hành (thông báo chỉ nằm ở bản đăng 04/10 → lưu trữ)', () => {
    const { container } = renderPage(path, Component);
    expect(container.querySelector('[data-policy-change-notice]')).toBeNull();
    expect(norm(container.textContent)).not.toContain('Thông báo thay đổi giờ hỗ trợ');
  });

  it('PolicyHistory liệt kê 2 phiên bản: 19/10/2026 (hiện hành) và 29/09/2026 (liên kết tới bản lưu trữ)', () => {
    const { container } = renderPage(path, Component);
    const items = container.querySelectorAll('section#lich-su-cap-nhat ol li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('19/10/2026');
    expect(items[0].textContent).toContain('Phiên bản hiện hành');
    expect(items[0].querySelector('a')).toBeNull();
    expect(items[1].textContent).toContain('29/09/2026');
    expect(items[1].querySelector('a').getAttribute('href')).toBe(`/policy-versions/${slug}/2026-09-29`);
  });

  it('sổ phiên bản: versions = [2026-10-19, 2026-09-29]', () => {
    expect(POLICY_VERSIONS[slug].versions).toEqual(['2026-10-19', '2026-09-29']);
  });

  it('bản lưu trữ /policy-versions/<slug>/2026-09-29 hiện giờ CŨ, băng "đã thay bởi 19/10/2026", không có lịch sử / liên kết lưu trữ', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/policy-versions/${slug}/2026-09-29`]}>
        <Routes>
          <Route path="/policy-versions/:slug/:date" element={<PolicyArchivedVersionPage />} />
          <Route path={path} element={<div>TRANG HIỆN HÀNH</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull(), { timeout: 5000 });

    const banner = container.querySelector('[data-policy-archive-banner]');
    expect(norm(banner.textContent)).toContain(
      'có hiệu lực từ 29/09/2026 và đã được thay thế bởi phiên bản có hiệu lực từ 19/10/2026.',
    );
    const text = norm(container.textContent);
    expect(text).toContain(viOld);
    expect(text).toContain(enOld);
    expect(text).not.toContain(viNew);
    expect(text).toContain('Cập nhật ngày 29/09/2026 — Áp dụng từ 29/09/2026');
    // Bản chép không còn PolicyHistory và liên kết "Các phiên bản đã lưu trữ" (policyVersions.js, quy trình bước 2).
    expect(container.querySelector('[data-policy-history]')).toBeNull();
    expect(container.querySelector('a[href="#lich-su-cap-nhat"]')).toBeNull();
    // Bản lưu trữ giữ nguyên khung thông báo đã hiển thị trên trang từ 04/10 đến hết 18/10/2026.
    expect(container.querySelector('[data-policy-change-notice]')).not.toBeNull();
  });
});

describe.each(OTHER_PAGES)('trang %s — không có thông báo đổi giờ hỗ trợ', (path, Component) => {
  it('không render khung thông báo (chỉ Support / Payment / Complaint từng ghi giờ hotline)', () => {
    const { container } = renderPage(path, Component);
    expect(container.querySelector('[data-policy-change-notice]')).toBeNull();
    expect(norm(container.textContent)).not.toContain('Thông báo thay đổi giờ hỗ trợ');
  });
});

describe('Support — bản tiếng Anh', () => {
  it('bấm English: mục Support Hours hiện "8:30 AM - 5:00 PM, Monday - Friday" (mục tiếng Việt bị ẩn)', () => {
    const { container } = renderPage('/support', Support);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    const visible = [...container.querySelectorAll('li')]
      .filter((li) => !li.className.includes('hidden'))
      .map((li) => norm(li.textContent));
    expect(visible).toContain('Hotline: 8:30 AM - 5:00 PM, Monday - Friday.');
  });
});
