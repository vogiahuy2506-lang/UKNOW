import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, applyThemeToDocument, isDarkScopePath } from '../themeStore.js';

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
    it('chỉ trả true cho đường dẫn thuộc /app hoặc /admin', () => {
      expect(isDarkScopePath('/app')).toBe(true);
      expect(isDarkScopePath('/app/campaigns')).toBe(true);
      expect(isDarkScopePath('/admin')).toBe(true);
      expect(isDarkScopePath('/admin/health')).toBe(true);

      expect(isDarkScopePath('/')).toBe(false);
      expect(isDarkScopePath('/huong-dan')).toBe(false);
      expect(isDarkScopePath('/terms')).toBe(false);
      expect(isDarkScopePath('/pricing')).toBe(false);
      expect(isDarkScopePath('/f/xyz')).toBe(false);
      expect(isDarkScopePath('/chat/123')).toBe(false);
      expect(isDarkScopePath('/checkout')).toBe(false);
      expect(isDarkScopePath('/apple')).toBe(false);
      expect(isDarkScopePath('/administrator')).toBe(false);
    });
  });

  describe('applyThemeToDocument', () => {
    it('/app + dark -> có lớp dark', () => {
      applyThemeToDocument('dark', '/app');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      applyThemeToDocument('dark', '/admin/system');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('/huong-dan, /terms, /f/x, / + dark -> KHÔNG có lớp dark', () => {
      document.documentElement.classList.add('dark');

      applyThemeToDocument('dark', '/huong-dan');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      applyThemeToDocument('dark', '/terms');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      applyThemeToDocument('dark', '/f/form-1');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      applyThemeToDocument('dark', '/');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
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
