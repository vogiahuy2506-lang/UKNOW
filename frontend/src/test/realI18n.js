/**
 * Mock i18n dùng TỪ ĐIỂN THẬT (vi/en) có nội suy {param} — để test kiểm đúng câu chữ người dùng thấy
 * (không phải chuỗi khoá trần như mock `namespace.key` của các spec cũ), và kiểm khoá có thật trong
 * từ điển. Dùng: vi.mock('<đường dẫn>/i18n', async () => (await import('<đường dẫn>/test/realI18n.js')).realI18nModule());
 */
import vi from '../i18n/vi.js';
import en from '../i18n/en.js';

const DICTS = { vi, en };

export function makeT(namespace = null, locale = 'vi') {
  return (key, params = {}) => {
    const full = namespace ? `${namespace}.${key}` : key;
    const value = full.split('.').reduce((node, part) => (node == null ? undefined : node[part]), DICTS[locale]);
    if (typeof value !== 'string') return full;
    return value.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
  };
}

export function realI18nModule(locale = 'vi') {
  return {
    useI18n: (namespace = null) => {
      if (namespace) return makeT(namespace, locale);
      return { t: makeT(null, locale), locale };
    },
  };
}
