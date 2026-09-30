import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PolicyArchivedVersionPage from '../PolicyArchivedVersionPage.jsx';

vi.mock('../policyVersions.js', () => ({
  POLICY_VERSIONS: {
    terms: {
      path: '/terms',
      titleVi: 'Điều khoản sử dụng dịch vụ',
      titleEn: 'Terms of Service',
      versions: ['2026-11-01', '2026-09-29', '2026-08-01'],
    },
  },
}));

vi.mock('../policyArchive/index.js', () => ({
  ARCHIVED_POLICY_LOADERS: {
    'terms/2026-09-29': () => Promise.resolve({ default: () => <div>Toàn văn bản cũ giả</div> }),
  },
}));

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/policy-versions/:slug/:date" element={<PolicyArchivedVersionPage />} />
        <Route path="/terms" element={<div>TRANG HIỆN HÀNH</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PolicyArchivedVersionPage', () => {
  it('slug lạ → "Không tìm thấy phiên bản này"', () => {
    renderAt('/policy-versions/khong-co/2026-09-29');
    expect(screen.getByText('Không tìm thấy phiên bản này')).toBeTruthy();
  });

  it('slug kiểu prototype ("constructor") → không tìm thấy, không crash', () => {
    renderAt('/policy-versions/constructor/2026-09-29');
    expect(screen.getByText('Không tìm thấy phiên bản này')).toBeTruthy();
  });

  it('ngày không nằm trong sổ → không tìm thấy, kèm liên kết về trang hiện hành', () => {
    renderAt('/policy-versions/terms/2026-09-28');
    expect(screen.getByText('Không tìm thấy phiên bản này')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/terms');
  });

  it('ngày = phiên bản hiện hành → chuyển về path của trang', () => {
    renderAt('/policy-versions/terms/2026-11-01');
    expect(screen.getByText('TRANG HIỆN HÀNH')).toBeTruthy();
  });

  it('phiên bản cũ có loader → băng thông báo + nội dung bản lưu trữ', async () => {
    renderAt('/policy-versions/terms/2026-09-29');
    expect(await screen.findByText('Toàn văn bản cũ giả')).toBeTruthy();
    const banner = document.querySelector('[data-policy-archive-banner]');
    expect(banner.textContent).toContain(
      'Đây là phiên bản lưu trữ của Điều khoản sử dụng dịch vụ, có hiệu lực từ 29/09/2026 và đã được thay thế bởi phiên bản có hiệu lực từ 01/11/2026.',
    );
    expect(banner.querySelector('a').getAttribute('href')).toBe('/terms');
  });

  it('phiên bản cũ đã khai nhưng thiếu loader → không tìm thấy (không màn trắng)', () => {
    renderAt('/policy-versions/terms/2026-08-01');
    expect(screen.getByText('Không tìm thấy phiên bản này')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/terms');
  });
});
