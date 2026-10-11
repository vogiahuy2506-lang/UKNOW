import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThemeStore, applyThemeToDocument, isDarkScopePath, DARK_SCOPE_PATTERN_SOURCE } from '../themeStore.js';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    useThemeStore.setState({ theme: 'light', isDark: false });
  });

  it('khởi tạo với theme mặc định là light', () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe('light');
    expect(state.isDark).toBe(false);
  });

  describe('isDarkScopePath', () => {
    // 11/10/2026: site Founder AI được tối; trang khách của khách hàng + thanh toán luôn sáng.
    it.each([
      '/app', '/app/campaigns', '/admin', '/admin/health', '/', '/pricing', '/contact', '/trial-demo', '/learning',
      '/login', '/register', '/forgot-password', '/reset-password', '/activate', '/support', '/huong-dan', '/huong-dan/voucher',
      '/terms', '/privacy-policy', '/public-dpa', '/refund-policy', '/policy-versions/terms/2026-09-01',
    ])('%s -> được tối', (p) => expect(isDarkScopePath(p)).toBe(true));

    it.each([
      '/f/xyz', '/f/xyz/s/tok', '/chat/123', '/lp/khoa-hoc', '/embed/lead-form', '/checkout', '/payment-success',
      '/invoices/ABC', '/l', '/apple', '/administrator', '/pricingx', '/termsx', '', null,
    ])('%s -> luôn sáng', (p) => expect(isDarkScopePath(p)).toBe(false));
  });

  describe('applyThemeToDocument', () => {
    it('/app + dark -> có lớp dark', () => {
      applyThemeToDocument('dark', '/app');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      applyThemeToDocument('dark', '/admin/system');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('/, /huong-dan, /terms + dark -> có lớp dark; /f/x, /chat/1, /checkout -> KHÔNG', () => {
      for (const p of ['/', '/huong-dan', '/terms', '/login']) {
        document.documentElement.classList.remove('dark');
        applyThemeToDocument('dark', p);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      }
      for (const p of ['/f/form-1', '/chat/1', '/checkout', '/lp/x']) {
        document.documentElement.classList.add('dark');
        applyThemeToDocument('dark', p);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      }
    });

    it('tên miền RIÊNG của khách (landing theo host) luôn sáng, kể cả đường dẫn "/"', () => {
      const spy = vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, hostname: 'khoahoc.khachhang.vn', pathname: '/' });
      try {
        document.documentElement.classList.add('dark');
        applyThemeToDocument('dark', '/');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it('index.html (chống nháy màu) chép ĐÚNG chuỗi DARK_SCOPE_PATTERN_SOURCE', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');
      expect(html).toContain(`var DARK_SCOPE = '${DARK_SCOPE_PATTERN_SOURCE}';`);
    });

    it('theme light luôn gỡ lớp dark kể cả ở /app', () => {
      document.documentElement.classList.add('dark');
      applyThemeToDocument('light', '/app');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('setTheme cập nhật state và localStorage', () => {
    const { setTheme } = useThemeStore.getState();
    setTheme('dark');

    const state = useThemeStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.isDark).toBe(true);
    expect(localStorage.getItem('uknow_theme')).toBe('dark');

    setTheme('light');
    const nextState = useThemeStore.getState();
    expect(nextState.theme).toBe('light');
    expect(nextState.isDark).toBe(false);
    expect(localStorage.getItem('uknow_theme')).toBe('light');
  });

  it('toggleTheme chuyển đổi qua lại giữa light và dark', () => {
    const { toggleTheme } = useThemeStore.getState();

    toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(useThemeStore.getState().isDark).toBe(true);

    toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().isDark).toBe(false);
  });
});
