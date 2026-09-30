import { describe, expect, it } from '@jest/globals';
import { HELP_SEED_ARTICLES } from '../helpSeed.data.js';

/**
 * 30/09/2026: "Nghị định 330/2026" là nghị định XỬ PHẠT hành chính, không phải căn cứ xin đồng
 * ý xử lý dữ liệu (luật sư chỉ ra). Căn cứ đúng: Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và
 * Nghị định 356/2025/NĐ-CP. Bài hướng dẫn là chữ khách đọc — không được dẫn số cũ.
 */
describe('helpSeed — căn cứ pháp lý dữ liệu cá nhân', () => {
  it.each(HELP_SEED_ARTICLES.map((a) => [a.slug, a]))('%s không dẫn Nghị định 330/2026', (_slug, article) => {
    for (const field of ['title', 'summary', 'body_md', 'body_html']) {
      expect(String(article[field] || '')).not.toMatch(/330\s*\/\s*2026/);
    }
  });
});
