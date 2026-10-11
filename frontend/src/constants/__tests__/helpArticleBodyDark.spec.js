import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_ARTICLE_BODY_RICH_CLASS } from '../helpArticleBodyStyle';

/**
 * 11/10/2026 — /huong-dan có giao diện tối. Thân bài HTML (từ CSDL) được tạo kiểu bằng biến thể tuỳ ý
 * `[&_p]:text-slate-700`... trong HELP_ARTICLE_BODY_RICH_CLASS — không gắn `dark:` từng thẻ được, nên
 * `index.css` có khối `html.dark .help-article-body <thẻ>`. Test khoá: thẻ nào hằng kia tô MÀU SÁNG
 * (chữ slate, nền slate, viền slate) thì khối tối phải có luật cho thẻ đó — thêm thẻ mới vào hằng mà quên
 * khối tối là chữ tối trên nền tối.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const LIGHT_COLOR_SELECTORS = [...HELP_ARTICLE_BODY_RICH_CLASS.matchAll(/\[&_([a-z0-9]+)\]:(?:text|bg|border)-(?:slate|gray)-\d+/g)].map(
  (m) => m[1],
);

describe('thân bài hướng dẫn — biến thể tối trong index.css', () => {
  it('hằng có tô màu sáng cho các thẻ chính (chốt để test này không rỗng)', () => {
    expect(new Set(LIGHT_COLOR_SELECTORS)).toEqual(new Set(['h2', 'p', 'blockquote', 'img', 'pre', 'code', 'th', 'td']));
  });

  it.each([...new Set(LIGHT_COLOR_SELECTORS)])('thẻ <%s> có luật html.dark .help-article-body', (tag) => {
    const re = new RegExp(`html\\.dark \\.help-article-body ${tag}\\b[^{]*\\{[^}]*\\}`);
    expect(css).toMatch(re);
  });

  it('mọi luật nhắc .help-article-body nằm dưới html.dark (giao diện sáng không đổi) và không viết hex cứng', () => {
    const all = css.match(/[^{}]*\.help-article-body[^{]*\{[^}]*\}/g) || [];
    expect(all.length).toBeGreaterThan(0);
    for (const rule of all) {
      const selectors = rule.split('{')[0].split(',').map((s) => s.trim());
      for (const sel of selectors) expect(sel.startsWith('html.dark .help-article-body')).toBe(true);
      expect(rule).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });
});
