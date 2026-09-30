import { describe, expect, it } from 'vitest';
import vi from '../vi.js';
import en from '../en.js';

/**
 * 30/09/2026: luật sư phát hiện hộp thoại đồng ý 3 chính sách (ConsentRequiredModal) dẫn
 * "Nghị định 330/2026/NĐ-CP" làm căn cứ — đó là nghị định XỬ PHẠT hành chính, không phải căn cứ
 * xin đồng ý. Căn cứ đúng (theo hướng dẫn luật sư 25/09 và Mẫu số 01): Luật Bảo vệ dữ liệu cá nhân
 * số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP. Chú thích trong code còn nhắc số cũ — đừng chép
 * lại vào chữ hiển thị.
 */
function collectStrings(node, path, out) {
  if (typeof node === 'string') {
    out.push({ path, text: node });
  } else if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) collectStrings(node[key], path ? `${path}.${key}` : key, out);
  }
  return out;
}

const WRONG_BASIS = /330\s*\/\s*2026/;

describe.each([
  ['vi', vi],
  ['en', en],
])('căn cứ pháp lý dữ liệu cá nhân — %s', (_lang, dict) => {
  it('không chuỗi hiển thị nào dẫn Nghị định 330/2026 (nghị định xử phạt)', () => {
    const hits = collectStrings(dict, '', []).filter((e) => WRONG_BASIS.test(e.text)).map((e) => e.path);
    expect(hits).toEqual([]);
  });

  it('hộp thoại đồng ý dẫn Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP', () => {
    expect(dict.consentRequired.description).toContain('91/2025/QH15');
    expect(dict.consentRequired.description).toContain('356/2025/NĐ-CP');
  });
});
