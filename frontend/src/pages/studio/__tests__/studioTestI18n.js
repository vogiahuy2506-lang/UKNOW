/**
 * Bản dịch thật (vi.js) cho spec của màn Studio: `t('chatbot.studio.xxx')` trả đúng câu tiếng Việt, khoá thiếu trả
 * lại CHÍNH khoá (như I18nProvider) nên spec đỏ ngay khi quên khai báo khoá trong vi.js.
 *
 * Dùng:
 *   vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);
 */
import vi from '../../../i18n/vi.js';

export function translate(key, params = {}) {
  let value = vi;
  for (const part of String(key).split('.')) {
    value = value && typeof value === 'object' ? value[part] : undefined;
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

export const i18nMock = {
  useI18n: () => ({ t: translate, locale: 'vi' }),
};
