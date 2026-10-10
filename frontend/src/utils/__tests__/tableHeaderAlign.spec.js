import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

// index.css: `.table th { @apply … text-left … }` có độ ưu tiên (0,1,1) > `.text-right` / `.text-center` (0,1,0)
// → trong bảng `.table`, tiêu đề cột số căn phải bằng `text-right` KHÔNG ăn, tiêu đề vẫn nằm lề trái còn ô số căn phải
// ("lệch cột" ở bảng Cohort của Phễu kích hoạt, 10/10/2026). Phải viết `!text-right` / `!text-center`.
// (Không sửa `.table th` toàn cục: nhiều bảng khác đang dựa vào text-left mặc định.)
const TABLE_CLASS_RE = /className="(?:[^"]*\s)?table(?:\s[^"]*)?"/;
const TH_UNIMPORTANT_ALIGN_RE = /<th\b[^>]*?className=(?:"|\{`)[^"`]*?(?<![!\w-])text-(?:right|center)\b/g;

function listJsx(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsx(full));
    else if (entry.isFile() && entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

describe('tableHeaderAlign — tiêu đề cột trong bảng .table phải dùng !text-right / !text-center', () => {
  it('không có <th className="… text-right|text-center …"> thiếu dấu ! trong tệp dùng bảng .table', () => {
    const violations = [];
    for (const file of listJsx(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!TABLE_CLASS_RE.test(text)) continue;
      for (const match of text.matchAll(TH_UNIMPORTANT_ALIGN_RE)) {
        const line = text.slice(0, match.index).split('\n').length;
        violations.push(`${path.relative(SRC, file)}:${line}: ${match[0].replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
    expect(
      violations,
      `Tiêu đề cột căn phải/giữa trong bảng .table phải viết !text-right / !text-center (xem chú thích đầu tệp):\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
