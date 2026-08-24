#!/usr/bin/env node
/**
 * Thay TOÀN BỘ `body_html` của một bài hướng dẫn bằng nội dung trong một file.
 *
 * Khác `patchHelpArticleText.js` — cái đó đổi từng đoạn chữ và đòi khớp đúng một
 * chỗ, hợp khi sửa vài câu. Còn khi cả thân bài hỏng (ví dụ bị dán nhầm thành một
 * khối <pre><code> markdown thô) thì không có gì để "khớp một chỗ" cả, phải viết
 * đè.
 *
 *   export HELP_API_TOKEN='...'        (token SUPER ADMIN)
 *   node backend/scripts/replaceHelpArticleBody.js --slug=voucher --from=body.html
 *   node backend/scripts/replaceHelpArticleBody.js --slug=voucher --from=body.html --apply
 *
 * Không có --apply thì chỉ in ra đối chiếu, không ghi gì.
 *
 * ⚠ Lệnh này XOÁ SẠCH thân bài cũ. Nếu bài đang có ảnh đã chèn mà file mới không
 * có, ảnh mất hết. Script đếm <img> hai bên và bắt xác nhận rõ ràng khi số ảnh
 * giảm — mất ảnh vì gõ nhầm một lệnh là chuyện đã xảy ra rồi (22/08).
 */
import fs from 'node:fs/promises';

const API_URL = (process.env.HELP_API_URL || 'https://founderai.biz/api').replace(/\/$/, '');
const TOKEN = process.env.HELP_API_TOKEN;

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, ...rest] = a.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);
const apply = Boolean(args.apply);

async function api(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} → ${res.status}: ${payload.message || text.slice(0, 200)}`);
  }
  return payload;
}

const countTags = (html, tag) => (String(html).match(new RegExp(`<${tag}\\b`, 'g')) || []).length;

async function main() {
  if (!TOKEN) throw new Error('Thiếu HELP_API_TOKEN (cần token SUPER ADMIN).');
  if (!args.slug) throw new Error('Thiếu --slug=<slug bài viết>');
  if (!args.from) throw new Error('Thiếu --from=<file html thân bài mới>');

  const nextHtml = (await fs.readFile(String(args.from), 'utf8')).trim();
  if (!nextHtml) throw new Error('File thân bài mới rỗng.');

  const list = await api('/help/admin/articles');
  const articles = list?.result || list?.data || [];
  const article = articles.find((a) => a.slug === args.slug && (a.locale || 'vi') === 'vi');
  if (!article) throw new Error(`không tìm thấy bài "${args.slug}" bản tiếng Việt`);

  const detail = await api(`/help/admin/articles/${article.id}`);
  const currentHtml = (detail?.result || detail?.data || detail)?.body_html || '';

  const before = { img: countTags(currentHtml, 'img'), len: currentHtml.length };
  const after = { img: countTags(nextHtml, 'img'), len: nextHtml.length };

  console.log(`Bài: ${args.slug}\n`);
  console.log(`  thân cũ : ${before.len} ký tự · ${before.img} ảnh`);
  console.log(`  thân mới: ${after.len} ký tự · ${after.img} ảnh`);

  const slotsLeft = (nextHtml.match(/\[ẢNH:/g) || []).length;
  if (slotsLeft) console.log(`  còn ${slotsLeft} ô chú thích "[ẢNH: …]" chưa có ảnh`);

  if (after.img < before.img) {
    console.log(`\n⚠ THÂN MỚI ÍT HƠN ${before.img - after.img} ẢNH so với bản đang chạy.`);
    if (!args.force) {
      throw new Error('Từ chối ghi đè để khỏi mất ảnh. Chắc chắn thì thêm --force.');
    }
    console.log('  --force được bật — vẫn ghi đè.');
  }

  if (!apply) {
    console.log('\nMới chỉ đối chiếu, CHƯA ghi gì. Thêm --apply để thực hiện.');
    return;
  }

  await api(`/help/admin/articles/${article.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body_html: nextHtml }),
  });
  console.log(`\nĐã thay thân bài "${args.slug}".`);
}

main().catch((error) => {
  console.error(`[replaceHelpArticleBody] THẤT BẠI: ${error.message}`);
  process.exit(1);
});
