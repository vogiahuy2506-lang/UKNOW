#!/usr/bin/env node
/**
 * Sửa một đoạn chữ trong bài hướng dẫn ĐANG CHẠY, qua API quản trị.
 *
 * Vì sao cần: sửa trong helpSeed.data.js chỉ đổi bản gốc trong repo. Bài trên
 * production đã khác bản gốc (đã chèn ảnh tay), và chạy seed lại để đồng bộ sẽ
 * XOÁ SẠCH ảnh — đúng sự cố ngày 22/08/2026. Nên phải vá tại chỗ.
 *
 * Dùng khi bài viết mô tả sai giao diện. Tính tới 23/08/2026 đã gặp ba chỗ:
 *   - "khối Chọn tài khoản Zalo" — không có khối nào tên vậy
 *   - "dải lệnh hẹn đổi gói ở trang Tổng quan gói" — dải nằm ở trang bảng giá
 *   - link nội bộ viết dạng slug trần
 *
 *   export HELP_API_TOKEN='...'        (token SUPER ADMIN — xem insertHelpScreenshots.js)
 *   node backend/scripts/patchHelpArticleText.js --slug=doi-goi --from=<file.json>
 *   node backend/scripts/patchHelpArticleText.js --slug=doi-goi --from=<file.json> --apply
 *
 * File json là mảng các cặp thay thế, áp dụng theo thứ tự:
 *   [{ "old": "chữ cũ", "new": "chữ mới" }, ...]
 *
 * Mỗi cặp phải khớp ĐÚNG MỘT chỗ. Khớp 0 hoặc nhiều hơn 1 thì dừng toàn bộ,
 * không sửa gì — sửa mù vào bài đang phục vụ người đọc là không chấp nhận được.
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

/** Rút gọn để in ra cho dễ đọc, không cắt giữa chừng mà không báo. */
const preview = (text) => (text.length > 90 ? `${text.slice(0, 90)}…` : text);

async function main() {
  if (!TOKEN) throw new Error('Thiếu HELP_API_TOKEN (cần token SUPER ADMIN).');
  if (!args.slug) throw new Error('Thiếu --slug=<slug bài viết>');
  if (!args.from) throw new Error('Thiếu --from=<file json chứa các cặp thay thế>');

  const replacements = JSON.parse(await fs.readFile(String(args.from), 'utf8'));
  if (!Array.isArray(replacements) || !replacements.length) {
    throw new Error('File json phải là mảng các cặp { old, new } và không được rỗng');
  }

  const list = await api('/help/admin/articles');
  const article = (list?.result || list?.data || [])
    .find((a) => a.slug === args.slug && (a.locale || 'vi') === (args.locale || 'vi'));
  if (!article) throw new Error(`không tìm thấy bài "${args.slug}"`);

  const detail = await api(`/help/admin/articles/${article.id}`);
  const body = detail?.result || detail?.data || detail;
  let html = body?.body_html;
  if (!html) throw new Error('bài này chưa có body_html');

  for (const [index, pair] of replacements.entries()) {
    const count = html.split(pair.old).length - 1;
    if (count !== 1) {
      throw new Error(
        `cặp #${index + 1} khớp ${count} chỗ (phải đúng 1) — dừng, KHÔNG sửa gì.\n`
        + `  tìm: ${preview(pair.old)}`,
      );
    }
    html = html.replace(pair.old, pair.new);
    console.log(`  ✓ #${index + 1}`);
    console.log(`      cũ : ${preview(pair.old)}`);
    console.log(`      mới: ${preview(pair.new)}`);
  }

  if (!apply) {
    console.log(`\n${replacements.length} chỗ sẽ sửa. Mới chỉ kiểm tra, CHƯA ghi gì. Thêm --apply để thực hiện.`);
    return;
  }

  await api(`/help/admin/articles/${article.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body_html: html }),
  });
  console.log(`\nĐã sửa ${replacements.length} chỗ trong "${args.slug}".`);
}

main().catch((error) => {
  console.error(`[patchHelpArticleText] THẤT BẠI: ${error.message}`);
  process.exitCode = 1;
});
