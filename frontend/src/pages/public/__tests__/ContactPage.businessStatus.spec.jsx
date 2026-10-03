/**
 * H1 mục 2 + vòng 2 (PLAN_SUA_AI_DOT3): thanh trạng thái trang Liên hệ ("Đang mở cửa" / "Đã đóng cửa") theo giờ làm việc
 * Thứ 2 – Thứ 6, 8:30 – 17:00 GIỜ VIỆT NAM (UTC+7), không theo múi giờ trình duyệt. Render trang thật với đồng hồ giả;
 * mốc dựng bằng Date.UTC (05/10/2026 là Thứ 2) và trình duyệt giả ở múi giờ khác Việt Nam để lỗi không bị che khi máy dev đang ở +7.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { simulateBrowserTimezone } from './simulateBrowserTimezone';

vi.mock('../../../features/landing-customizer', () => ({
  usePublicLandingOverrides: () => ({ getOverride: () => null }),
}));

import ContactPage from '../ContactPage';
import { I18nProvider } from '../../../i18n';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const utc = (day, h, m = 0) => new Date(Date.UTC(2026, 9, day, h, m, 0));

function renderAt(date) {
  vi.setSystemTime(date);
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <I18nProvider>
        <ContactPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  if (!window.IntersectionObserver) {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ContactPage — trạng thái mở/đóng cửa theo giờ Việt Nam', () => {
  it('Thứ 2 08:15 VN (01:15 UTC): ĐÃ ĐÓNG CỬA (bản đầu hiện "Đang mở cửa" vì so hour >= 8)', () => {
    simulateBrowserTimezone(7);
    const { container } = renderAt(utc(5, 1, 15));
    const text = norm(container.textContent);
    expect(text).toContain('Đã đóng cửa');
    expect(text).not.toContain('Đang mở cửa');
  });

  it('Thứ 2 08:30 VN (01:30 UTC): ĐANG MỞ CỬA', () => {
    simulateBrowserTimezone(7);
    const { container } = renderAt(utc(5, 1, 30));
    const text = norm(container.textContent);
    expect(text).toContain('Đang mở cửa');
    expect(text).not.toContain('Đã đóng cửa');
  });

  it('Thứ 2 17:00 VN (10:00 UTC): đã đóng cửa', () => {
    simulateBrowserTimezone(7);
    const { container } = renderAt(utc(5, 10, 0));
    expect(norm(container.textContent)).toContain('Đã đóng cửa');
  });

  it('Thứ 7 10:00 VN (03:00 UTC): đã đóng cửa (không làm Thứ 7)', () => {
    simulateBrowserTimezone(7);
    const { container } = renderAt(utc(10, 3, 0));
    expect(norm(container.textContent)).toContain('Đã đóng cửa');
  });

  it('khách ở New York (UTC-5): 03:00 UTC Thứ 2 = 10:00 VN → ĐANG MỞ CỬA (giờ máy khách chỉ là Chủ nhật 22:00)', () => {
    simulateBrowserTimezone(-5);
    const { container } = renderAt(utc(5, 3, 0));
    const text = norm(container.textContent);
    expect(text).toContain('Đang mở cửa');
    expect(text).not.toContain('Đã đóng cửa');
  });

  it('khách ở New York (UTC-5): 09:00 UTC Thứ 6 = 16:00 VN → ĐANG MỞ CỬA (giờ máy khách là 04:00)', () => {
    simulateBrowserTimezone(-5);
    const { container } = renderAt(utc(9, 9, 0));
    expect(norm(container.textContent)).toContain('Đang mở cửa');
  });

  it('khách ở New Zealand (UTC+13): 00:00 UTC Thứ 2 = 07:00 VN → ĐÃ ĐÓNG CỬA (giờ máy khách là Thứ 2 13:00)', () => {
    simulateBrowserTimezone(13);
    const { container } = renderAt(utc(5, 0, 0));
    const text = norm(container.textContent);
    expect(text).toContain('Đã đóng cửa');
    expect(text).not.toContain('Đang mở cửa');
  });

  it('chữ giờ làm việc hiển thị trên trang: "T2 – T6 · 08:30 – 17:00", không còn 08:00', () => {
    simulateBrowserTimezone(7);
    const { container } = renderAt(utc(5, 3, 0));
    const text = norm(container.textContent);
    expect(text).toContain('T2 – T6 · 08:30 – 17:00');
    expect(text).not.toContain('08:00 – 17:00');
  });
});
