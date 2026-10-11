import { create } from 'zustand';

const THEME_STORAGE_KEY = 'uknow_theme';

export const isDarkScopePath = (pathname) => {
  if (!pathname || typeof pathname !== 'string') return false;
  return /^\/(app|admin)(\/|$)/.test(pathname);
};

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // fallback if localStorage is blocked
  }
  return 'light';
};

export const applyThemeToDocument = (theme, pathname) => {
  if (typeof document === 'undefined') return;
  const currentPath = pathname !== undefined
    ? pathname
    : (typeof window !== 'undefined' ? window.location.pathname : '');
  const shouldBeDark = theme === 'dark' && isDarkScopePath(currentPath);
  document.documentElement.classList.toggle('dark', shouldBeDark);
};

export const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),
  isDark: getInitialTheme() === 'dark',
  setTheme: (newTheme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // ignore storage error
    }
    applyThemeToDocument(newTheme);
    set({ theme: newTheme, isDark: newTheme === 'dark' });
  },
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },
}));
