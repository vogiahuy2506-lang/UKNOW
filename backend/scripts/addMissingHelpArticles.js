#!/usr/bin/env node
/**
 * Đưa các bài hướng dẫn MỚI trong helpSeed.data.js lên hệ thống đang chạy — CHỈ THÊM bài
 * còn thiếu, KHÔNG BAO GIỜ đụng bài đã có.
 *
 * Vì sao không dùng nút "Đặt lại bài mẫu" (POST /help/admin/seed): nút đó GHI ĐÈ toàn bộ bài
 * bằng bản gốc trong repo. Bài trên production đã chèn ảnh tay (đo 21/09/2026: ~130 ảnh ở 20
 * bài tiếng Việt), seed lại là mất sạch — đúng sự cố 22/08/2026. Thêm bài mới thì không có lý
 * do gì phải trả giá đó.
 *
 * Đi bằng API quản trị sẵn có, cùng họ với patchHelpArticleText.js:
 *   GET  /api/help/admin/articles   → biết slug nào đã có
 *   POST /api/help/admin/articles   → tạo bài; bài published được server TỰ tính vector
 *                                     (adminCreateArticle → reindexArticle), trợ lý AI đọc
 *                                     được ngay, không cần bấm Reindex tay.
 *
 * Chạy trên MÁY CỦA BẠN:
 *   export HELP_API_TOKEN='...'     (token SUPER ADMIN — cách lấy xem insertHelpScreenshots.js)
 *   node backend/scripts/addMissingHelpArticles.js            # chỉ liệt kê, không ghi
 *   node backend/scripts/addMissingHelpArticles.js --apply    # tạo các bài còn thiếu
 *   node backend/scripts/addMissingHelpArticles.js --only=bieu-mau,doi-tac --apply
 *
 * Bài đã có trên hệ thống mà khác bản trong repo → script CHỈ báo tên, không sửa. Muốn sửa
 * chữ trong bài đang chạy thì dùng patchHelpArticleText.js.
 */
import { HELP_SEED_ARTICLES } from '../src/services/help/helpSeed.data.js';

const API_URL = (process.env.HELP_API_URL || 'https://founderai.biz/api').replace(/\/$/, '');
const TOKEN = process.env.HELP_API_TOKEN;

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, ...rest] = a.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);
const apply = Boolean(args.apply);
const only = typeof args.only === 'string'
  ? new Set(args.only.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

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

async function main() {
  if (!TOKEN) throw new Error('Thiếu HELP_API_TOKEN (cần token SUPER ADMIN).');

  if (only) {
    const unknown = [...only].filter((slug) => !HELP_SEED_ARTICLES.some((a) => a.slug === slug));
    if (unknown.length) throw new Error(`--only có slug không nằm trong helpSeed.data.js: ${unknown.join(', ')}`);
  }

  const list = await api('/help/admin/articles');
  const existing = new Set(
    (list?.result || list?.data || [])
      .filter((a) => (a.locale || 'vi') === 'vi')
      .map((a) => a.slug),
  );

  const candidates = HELP_SEED_ARTICLES.filter((a) => !only || only.has(a.slug));
  const missing = candidates.filter((a) => !existing.has(a.slug));
  const present = candidates.filter((a) => existing.has(a.slug));

  console.log(`Hệ thống: ${API_URL}`);
  console.log(`Đã có ${present.length} bài (KHÔNG đụng tới): ${present.map((a) => a.slug).join(', ') || '—'}`);
  console.log(`Còn thiếu ${missing.length} bài:`);
  for (const a of missing) console.log(`  + ${a.slug.padEnd(22)} ${a.title}`);

  if (!missing.length) {
    console.log('\nKhông có gì để thêm.');
    return;
  }
  if (!apply) {
    console.log('\nMới chỉ kiểm tra, CHƯA ghi gì. Thêm --apply để tạo các bài trên.');
    return;
  }

  // Tạo lần lượt, không song song: mỗi bài kéo theo một lượt tính vector ở server.
  for (const a of missing) {
    const created = await api('/help/admin/articles', {
      method: 'POST',
      body: JSON.stringify({ ...a, locale: 'vi', is_published: true }),
    });
    const row = created?.result || created?.data || {};
    console.log(`  ✓ ${a.slug} → id ${row.id ?? '?'}`);
  }
  console.log(`\nĐã thêm ${missing.length} bài. Bản tiếng Anh: vào trang quản trị bài hướng dẫn, mở từng bài rồi bấm dịch.`);
}

main().catch((error) => {
  console.error(`[addMissingHelpArticles] THẤT BẠI: ${error.message}`);
  process.exitCode = 1;
});
