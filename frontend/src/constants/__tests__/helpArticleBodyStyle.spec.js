import { describe, expect, it } from 'vitest';
import { HELP_ARTICLE_BODY_RICH_CLASS } from '../helpArticleBodyStyle';

/**
 * Hằng này được viết nhiều dòng cho dễ đọc và dùng làm `className` trong React —
 * ở đó xuống dòng vô hại. Nhưng RichTextEditor còn đưa nó xuống ProseMirror qua
 * `editorProps.attributes.class`, và ProseMirror gọi `classList.add()`, mà
 * DOMTokenList từ chối token chứa khoảng trắng. Nên bên editor BẮT BUỘC gom
 * khoảng trắng trước khi truyền. Test này khoá đúng ràng buộc đó.
 */
describe('HELP_ARTICLE_BODY_RICH_CLASS', () => {
  it('sau khi gom khoảng trắng thì mọi token đều hợp lệ với DOMTokenList', () => {
    const normalized = HELP_ARTICLE_BODY_RICH_CLASS.replace(/\s+/g, ' ').trim();
    const tokens = normalized.split(' ');

    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token).not.toBe('');
      expect(/\s/.test(token)).toBe(false);
    }

    // classList.add ném lỗi thật nếu token có khoảng trắng — thử trực tiếp.
    const el = document.createElement('div');
    expect(() => el.classList.add(...tokens)).not.toThrow();
  });

  it('vẫn khai các class làm hiện bullet / số thứ tự / cỡ tiêu đề', () => {
    // Đây là lý do editor dùng hằng này thay cho `prose` (plugin typography
    // không được cài nên `prose` không sinh CSS nào).
    expect(HELP_ARTICLE_BODY_RICH_CLASS).toContain('[&_ul]:list-disc');
    expect(HELP_ARTICLE_BODY_RICH_CLASS).toContain('[&_ol]:list-decimal');
    expect(HELP_ARTICLE_BODY_RICH_CLASS).toContain('[&_h2]:text-2xl');
  });
});
