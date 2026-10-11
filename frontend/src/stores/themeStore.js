import { create } from 'zustand';
import { isPrimaryAppHostname } from '../utils/isPrimaryAppHost';

const THEME_STORAGE_KEY = 'uknow_theme';

/**
 * Đường dẫn ĐƯỢC PHÉP tối (11/10/2026 — user chọn "site Founder AI có tối"): app, admin và các trang của chính site
 * Founder AI (trang chủ, bảng giá, liên hệ, dùng thử, học, đăng nhập/đăng ký, hướng dẫn, chính sách).
 * KHÔNG có trong danh sách = luôn sáng: trang KHÁCH CỦA KHÁCH HÀNG mở (biểu mẫu /f, chatbot /chat, landing /lp + tên
 * miền riêng, /embed) và thanh toán (/checkout, /payment-success, /invoices) — giữ màu thương hiệu của họ.
 * Danh sách cho phép (không phải danh sách cấm): trang công khai MỚI mặc định sáng cho tới khi có lớp tối.
 * `index.html` (chống nháy màu trước khi React chạy) chép đúng chuỗi này — test `themeStore.spec` so khớp hai bản.
 */
export const DARK_SCOPE_PATTERN_SOURCE =
  '^/(?:$|(?:app|admin|pricing|contact|trial-demo|learning|login|register|forgot-password|reset-password|activate|support|huong-dan'
  + '|privacy-policy|private-policy|public-dpa|terms|pricing-policy|payment-policy|complaint-policy|refund-policy|service-terms'
  + '|service-delivery-policy|rights-and-duties|policy-versions)(?:/|$))';
const DARK_SCOPE_RE = new RegExp(DARK_SCOPE_PATTERN_SOURCE);

export const isDarkScopePath = (pathname) => {
  if (!pathname || typeof pathname !== 'string') return false;
  return DARK_SCOPE_RE.test(pathname);
};

/** Tên miền riêng của khách (landing render theo host) luôn sáng, kể cả đường dẫn "/". */
const isDarkScopeHost = () => (typeof window === 'undefined' ? true : isPrimaryAppHostname(window.location.hostname));

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
  const shouldBeDark = theme === 'dark' && isDarkScopePath(currentPath) && isDarkScopeHost();
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
