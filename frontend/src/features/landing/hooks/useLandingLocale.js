import { useCallback, useEffect, useState } from 'react';
import { LANDING_COPY } from '../constants/landingCopy.js';

/** Khóa localStorage để nhớ ngôn ngữ landing giữa các lần truy cập */
export const LANDING_LOCALE_STORAGE_KEY = 'uknow-landing-lang';

/**
 * Quản lý ngôn ngữ hiển thị trang landing (vi/en).
 *
 * Luồng hoạt động:
 * 1. Khởi tạo từ localStorage nếu có giá trị hợp lệ, mặc định tiếng Việt.
 * 2. Mỗi khi đổi locale, lưu lại và cập nhật `document.documentElement.lang` (SEO/a11y).
 * 3. Trả về bản copy tương ứng để component render chuỗi đã dịch.
 *
 * @returns {{ locale: 'vi' | 'en', setLocale: (l: 'vi' | 'en') => void, copy: typeof LANDING_COPY.vi }}
 */
export function useLandingLocale() {
  const [locale, setLocaleState] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(LANDING_LOCALE_STORAGE_KEY) : null;
      if (stored === 'vi' || stored === 'en') return stored;
    } catch {
      /* bỏ qua nếu localStorage không khả dụng */
    }
    return 'vi';
  });

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'vi';
    try {
      window.localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (next === 'vi' || next === 'en') setLocaleState(next);
  }, []);

  const copy = LANDING_COPY[locale];

  return { locale, setLocale, copy };
}
