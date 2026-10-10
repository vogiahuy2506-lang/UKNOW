/**
 * Chọn bản tiếng Anh khi locale `en` VÀ server có gửi bản đó; không thì dùng bản gốc (tiếng Việt).
 * @param {object} item
 * @param {string} locale
 * @returns {{ title: string, message: string }}
 */
export function pickLocalizedText(item, locale) {
  const useEn = locale === 'en';
  return {
    title: (useEn && item.titleEn) || item.title || '',
    message: (useEn && item.messageEn) || item.message || '',
  };
}
