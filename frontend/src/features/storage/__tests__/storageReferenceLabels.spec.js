import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import viDictionary from '../../../i18n/vi';
import enDictionary from '../../../i18n/en';
import {
  REFERENCE_LABEL_KEYS,
  SOURCE_LABEL_KEYS,
  resolveReferenceLabel,
  resolveSourceLabel,
} from '../storageReferenceLabels';

/**
 * Nhãn "tệp đang dùng ở đâu" dịch theo `referenceType` (backend chỉ có nhãn tiếng Việt cứng). Bảng khoá là hằng số tĩnh,
 * nên phải ghim từng phần tử và đối chiếu với mã nguồn backend: thêm kiểu tham chiếu ở `REFERENCE_CONFIGS` mà quên dòng
 * dịch thì người dùng tiếng Anh đọc nhãn tiếng Việt (hoặc mã thô) — không test nào đỏ nếu không có spec này.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const backendSource = fs.readFileSync(
  path.resolve(here, '../../../../../backend/src/services/storage/storageReference.service.js'),
  'utf8',
);

/** Khoá cấp 1 của `export const REFERENCE_CONFIGS = { … };`. */
function backendReferenceTypes() {
  const start = backendSource.indexOf('export const REFERENCE_CONFIGS = {');
  if (start < 0) throw new Error('Không thấy REFERENCE_CONFIGS trong storageReference.service.js');
  const end = backendSource.indexOf('\n};', start);
  return [...backendSource.slice(start, end).matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);
}

const lookup = (dictionary) => (key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), dictionary) ?? key;

describe('nhãn kiểu tham chiếu ↔ backend', () => {
  it('đọc được danh sách kiểu từ backend (chốt chống phép quét rỗng)', () => {
    const types = backendReferenceTypes();
    expect(types.length).toBeGreaterThanOrEqual(19);
    expect(types).toContain('form');
    expect(types).toContain('zalo_template');
  });

  it('MỌI kiểu tham chiếu của backend có khoá nhãn, và ngược lại không có khoá thừa', () => {
    expect(Object.keys(REFERENCE_LABEL_KEYS).sort()).toEqual([...backendReferenceTypes()].sort());
  });

  it.each([['vi', viDictionary], ['en', enDictionary]])('%s: mọi khoá nhãn trỏ tới chuỗi có thật (không hiện khoá thô)', (_, dictionary) => {
    const t = lookup(dictionary);
    for (const [type, key] of Object.entries(REFERENCE_LABEL_KEYS)) {
      const text = t(key);
      expect(text, `${type} → ${key}`).not.toBe(key);
      expect(text.trim().length, `${type} → ${key}`).toBeGreaterThan(0);
    }
    for (const [source, key] of Object.entries(SOURCE_LABEL_KEYS)) {
      expect(t(key), `${source} → ${key}`).not.toBe(key);
    }
  });

  it('bản tiếng Anh thật sự là tiếng Anh: không trùng nguyên văn bản tiếng Việt (trừ tên riêng giống nhau)', () => {
    const sameInBoth = new Set(['Chatbot', 'Landing page']);
    const t = (dictionary) => lookup(dictionary);
    for (const [type, key] of Object.entries(REFERENCE_LABEL_KEYS)) {
      const vi = t(viDictionary)(key);
      const en = t(enDictionary)(key);
      if (vi === en) expect(sameInBoth.has(vi), `${type}: en giống hệt vi "${vi}"`).toBe(true);
    }
  });
});

describe('resolveReferenceLabel', () => {
  const t = lookup(viDictionary);

  it('dịch theo kiểu, bỏ qua nhãn tiếng Việt backend gửi kèm', () => {
    expect(resolveReferenceLabel('form', 'NHÃN BACKEND', t)).toBe('Biểu mẫu');
    expect(resolveReferenceLabel('zalo_template', 'Mẫu tin nhắn', lookup(enDictionary))).toBe('Message template');
  });

  it('kiểu lạ → nhãn backend; không có nhãn → mã thô (để thấy mà bổ sung)', () => {
    expect(resolveReferenceLabel('cho_la', 'Chỗ lạ', t)).toBe('Chỗ lạ');
    expect(resolveReferenceLabel('cho_la', undefined, t)).toBe('cho_la');
    expect(resolveReferenceLabel(undefined, undefined, t)).toBe('');
  });
});

describe('resolveSourceLabel', () => {
  const t = lookup(viDictionary);

  it('nguồn tệp chat: Trợ lý AI / chat thử chatbot / web chat; Hộp thư theo TÊN MENU (nav.inbox)', () => {
    expect(resolveSourceLabel('ai_assistant', t)).toBe('Trợ lý AI');
    expect(resolveSourceLabel('chatbot_studio', t)).toBe('chat thử chatbot');
    expect(resolveSourceLabel('chatbot_web', t)).toBe('web chat');
    expect(resolveSourceLabel('inbox_outbound', t)).toBe(viDictionary.nav.inbox);
  });

  it('nguồn lạ hoặc trống → null (không in mã thô)', () => {
    expect(resolveSourceLabel('nguon_la', t)).toBeNull();
    expect(resolveSourceLabel(null, t)).toBeNull();
  });
});
