import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vi from '../vi.js';
import en from '../en.js';

/**
 * Trình soạn Tuỳ chỉnh Landing (11/10/2026) gọi khoá dịch qua hàm bọc `th('...')` / `tt('...')` và khoá ghép theo
 * trang/thiết bị — `translationKeys.spec.js` chỉ quét `t('a.b')` literal nên KHÔNG thấy những lời gọi này; khoá thiếu sẽ hiện
 * nguyên chuỗi khoá cho người dùng mà không test nào đỏ. Test này đọc mã nguồn ba tệp và đòi mọi khoá có ở cả vi lẫn en.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPONENTS = path.join(SRC, 'features/landing-customizer/components');

const get = (dict, dotted) => dotted.split('.').reduce((n, k) => (n == null ? undefined : n[k]), dict);
const flatten = (node, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(node || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(p);
    else flatten(v, p, out);
  }
  return out;
};
const read = (name) => fs.readFileSync(path.join(COMPONENTS, name), 'utf8');
const matchAll = (source, re) => [...source.matchAll(re)].map((m) => m[1]);

describe('khoá i18n của trình soạn Tuỳ chỉnh Landing', () => {
  it('landingCustomizer.editor có cùng bộ khoá ở vi và en', () => {
    const viKeys = flatten(vi.landingCustomizer.editor).sort();
    const enKeys = flatten(en.landingCustomizer.editor).sort();
    expect(viKeys.length).toBeGreaterThan(60);
    expect(enKeys).toEqual(viKeys);
  });

  it('mọi khoá được gọi trong CanvasEditor / HtmlFullPageEditor / EditorModeSettings đều có ở vi và en', () => {
    const used = new Set();

    for (const file of ['CanvasEditor.jsx', 'HtmlFullPageEditor.jsx']) {
      const src = read(file);
      matchAll(src, /\bt\('([\w.]+)'/g).forEach((k) => used.add(k));
    }
    matchAll(read('HtmlFullPageEditor.jsx'), /\bth\('([\w.]+)'/g).forEach((k) => used.add(`landingCustomizer.editor.html.${k}`));
    matchAll(read('EditorModeSettings.jsx'), /\btt\('([\w.]+)'/g).forEach((k) => used.add(`landingCustomizer.editor.settings.${k}`));

    // khoá ghép động trong mã
    ['hero', 'contact', 'pricing'].forEach((id) => {
      used.add(`landingCustomizer.pages.${id}`);
      used.add(`landingCustomizer.editor.html.aiPlaceholder.${id}`);
    });
    ['mobile', 'tablet', 'desktop'].forEach((id) => used.add(`landingCustomizer.devices.${id}`));
    ['canvaName', 'canvaDesc', 'htmlName', 'htmlDesc', 'state.default', 'state.html', 'state.loading', 'state.unknown']
      .forEach((k) => used.add(`landingCustomizer.editor.settings.${k}`));

    expect(used.size).toBeGreaterThan(40);
    const missing = [];
    for (const key of used) {
      for (const [name, dict] of [['vi', vi], ['en', en]]) {
        if (typeof get(dict, key) !== 'string') missing.push(`${name}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
