/**
 * Sinh lại `body_html` của từng bài trong helpSeed.data.js từ `body_md`.
 *
 * Vì sao cần: trang đọc ưu tiên `bodyHtml` (`HelpArticlePage.jsx`), nên sửa
 * `body_md` mà quên dựng lại HTML là người dùng đọc bản cũ. Việc đó ĐÃ xảy ra
 * với bài `doi-goi` (mất một dòng về thời điểm xuất hoá đơn).
 *
 * Dùng đúng bộ chuyển của giao diện (`frontend/src/utils/miniMarkdownToHtml.js`)
 * để bản seed và nút "Chuyển sang rich" bên admin cho ra cùng kết quả.
 *
 * CHỈ DÙNG KHI PHÁT TRIỂN — script đọc sang thư mục frontend nên không chạy
 * được trong image backend. Chạy:
 *   node scripts/regenHelpSeedHtml.mjs          # ghi đè
 *   node scripts/regenHelpSeedHtml.mjs --check  # chỉ báo lệch, không ghi
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(here, '../src/services/help/helpSeed.data.js');
const CONVERTER_PATH = resolve(here, '../../frontend/src/utils/miniMarkdownToHtml.js');

const { HELP_SEED_ARTICLES } = await import(SEED_PATH);
const { miniMarkdownToHtml } = await import(CONVERTER_PATH);

const checkOnly = process.argv.includes('--check');

/** Bọc chuỗi vào template literal an toàn — 2 bài có backtick trong nội dung. */
function escapeForTemplateLiteral(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

let source = readFileSync(SEED_PATH, 'utf8');
const stale = [];

for (const article of HELP_SEED_ARTICLES) {
  const generated = miniMarkdownToHtml(article.body_md || '');
  if (generated === article.body_html) continue;
  stale.push(article.slug);
  if (checkOnly) continue;

  // Định vị dòng `body_html:` ngay sau `slug: '<slug>'` của đúng bài này.
  const slugAt = source.indexOf(`slug: '${article.slug}'`);
  if (slugAt === -1) throw new Error(`Không tìm thấy slug ${article.slug} trong seed`);
  const htmlAt = source.indexOf('body_html: `', slugAt);
  if (htmlAt === -1) throw new Error(`Bài ${article.slug} không có body_html`);

  // Kết thúc là backtick KHÔNG bị escape đầu tiên sau chỗ mở.
  const bodyStart = htmlAt + 'body_html: `'.length;
  let end = bodyStart;
  while (end < source.length) {
    if (source[end] === '\\') { end += 2; continue; }
    if (source[end] === '`') break;
    end += 1;
  }
  if (end >= source.length) throw new Error(`Không thấy backtick đóng của ${article.slug}`);

  source = source.slice(0, bodyStart) + escapeForTemplateLiteral(generated) + source.slice(end);
}

if (stale.length === 0) {
  console.log(`✅ Cả ${HELP_SEED_ARTICLES.length} bài đã khớp — body_html đúng bằng bản sinh từ body_md.`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`❌ ${stale.length} bài có body_html lệch với body_md: ${stale.join(', ')}`);
  console.error('   Chạy: node scripts/regenHelpSeedHtml.mjs');
  process.exit(1);
}

writeFileSync(SEED_PATH, source, 'utf8');
console.log(`✅ Đã sinh lại body_html cho ${stale.length} bài: ${stale.join(', ')}`);
