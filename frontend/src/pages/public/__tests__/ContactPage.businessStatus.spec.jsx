/**
 * H1 mục 2 (PLAN_SUA_AI_DOT3): thanh trạng thái trang Liên hệ ("Đang mở cửa" / "Đã đóng cửa") theo giờ làm việc
 * Thứ 2 – Thứ 6, 8:30 – 17:00. Render trang thật với đồng hồ giả (05/10/2026 là Thứ 2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../features/landing-customizer', () => ({
  usePublicLandingOverrides: () => ({ getOverride: () => null }),
}));

import ContactPage from '../ContactPage';
import { I18nProvider } from '../../../i18n';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ContactPage — trạng thái mở/đóng cửa và giờ hiển thị', () => {
  it('Thứ 2 08:15: ĐÃ ĐÓNG CỬA (bản cũ hiện "Đang mở cửa" vì so hour >= 8)', () => {
    const { container } = renderAt(new Date(2026, 9, 5, 8, 15));
    const text = norm(container.textContent);
    expect(text).toContain('Đã đóng cửa');
    expect(text).not.toContain('Đang mở cửa');
  });

  it('Thứ 2 08:30: ĐANG MỞ CỬA', () => {
    const { container } = renderAt(new Date(2026, 9, 5, 8, 30));
    const text = norm(container.textContent);
    expect(text).toContain('Đang mở cửa');
    expect(text).not.toContain('Đã đóng cửa');
  });

  it('Thứ 2 17:00: đã đóng cửa', () => {
    const { container } = renderAt(new Date(2026, 9, 5, 17, 0));
    expect(norm(container.textContent)).toContain('Đã đóng cửa');
  });

  it('Thứ 7 10:00: đã đóng cửa (không làm Thứ 7)', () => {
    const { container } = renderAt(new Date(2026, 9, 10, 10, 0));
    expect(norm(container.textContent)).toContain('Đã đóng cửa');
  });

  it('chữ giờ làm việc hiển thị trên trang: "T2 – T6 · 08:30 – 17:00", không còn 08:00', () => {
    const { container } = renderAt(new Date(2026, 9, 5, 10, 0));
    const text = norm(container.textContent);
    expect(text).toContain('T2 – T6 · 08:30 – 17:00');
    expect(text).not.toContain('08:00 – 17:00');
  });
});
