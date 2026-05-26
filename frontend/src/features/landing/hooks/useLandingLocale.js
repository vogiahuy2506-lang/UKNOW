import { useCallback } from 'react';
import { useI18n } from '../../../i18n';

/**
 * Đồng bộ ngôn ngữ landing page với i18n toàn cục.
 * Khi đổi ngôn ngữ ở landing page, sẽ cập nhật global i18n context.
 */
export function useLandingLocale() {
  const { locale, changeLocale } = useI18n();

  const setLocale = useCallback((next) => {
    if (next === 'vi' || next === 'en') {
      changeLocale(next);
    }
  }, [changeLocale]);

  return { locale, setLocale };
}
