#!/usr/bin/env node
/**
 * Vá body_html của bài hướng dẫn ĐANG NẰM TRONG DB, giữ nguyên ảnh admin đã chèn.
 *
 * Vá hai thứ, cả hai đều do bộ chuyển Markdown→HTML cũ sinh ra:
 *   1. Danh sách đánh số bị cắt rời — bài hiện 1 / 1 / 1 thay vì 1 / 2 / 3 vì mỗi
 *      chú thích ảnh cắt <ol> làm đôi.
 *   2. Link nội bộ dạng slug trần (href="quick-send") — chỉ đúng khi đứng ở
 *      /huong-dan/..., bấm từ ô Xem trước trong trang admin sẽ trỏ sang
 *      /admin/help-articles/quick-send và báo lỗi id không hợp lệ.
 *
 * Bộ chuyển đã được sửa, nhưng HTML sinh ra trước đó thì đã nằm sẵn trong DB.
 *
 * Vì sao KHÔNG chạy seed cho xong: seed ghi đè cả body_md lẫn body_html của toàn
 * bộ 19 bài bằng bản trong repo → xoá sạch ảnh thật admin đã chèn. Script này
 * chỉ di chuyển node trong chính HTML đang lưu, không dựng lại từ Markdown.
 *
 *   node scripts/repairHelpArticleLists.js           # chỉ xem trước, KHÔNG ghi
 *   node scripts/repairHelpArticleLists.js --apply   # ghi vào DB
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import {
  repairHelpArticleHtml,
  countOrderedLists,
  countBareSlugLinks,
  stripTags,
} from '../src/utils/helpArticleListRepair.util.js';

const apply = process.argv.includes('--apply');

async function main() {
  const { rows } = await db.query(
    `SELECT id, slug, locale, body_html
       FROM help_articles
      WHERE body_html IS NOT NULL AND body_html <> ''
      ORDER BY id`,
  );

  const changed = [];
  for (const row of rows) {
    const repaired = repairHelpArticleHtml(row.body_html);
    if (repaired === row.body_html) continue;

    // Chốt chặn: bản vá chỉ được phép di chuyển thẻ, tuyệt đối không đổi chữ.
    if (stripTags(repaired) !== stripTags(row.body_html)) {
      console.error(`  !! BỎ QUA ${row.slug} (${row.locale}) — nội dung chữ bị đổi, không an toàn để ghi`);
      continue;
    }
    changed.push({ row, repaired });
  }

  if (!changed.length) {
    console.log(`Đã quét ${rows.length} bài — không bài nào cần vá.`);
    return;
  }

  console.log(`Đã quét ${rows.length} bài, ${changed.length} bài cần vá:\n`);
  for (const { row, repaired } of changed) {
    const parts = [];
    const olBefore = countOrderedLists(row.body_html);
    const olAfter = countOrderedLists(repaired);
    if (olBefore !== olAfter) parts.push(`khối <ol>: ${olBefore} -> ${olAfter}`);
    const linkBefore = countBareSlugLinks(row.body_html);
    const linkAfter = countBareSlugLinks(repaired);
    if (linkBefore !== linkAfter) parts.push(`link slug trần: ${linkBefore} -> ${linkAfter}`);
    console.log(`  #${row.id} ${row.slug} (${row.locale}) — ${parts.join(', ')}`);
  }

  if (!apply) {
    console.log('\nMới chỉ xem trước, CHƯA ghi gì. Chạy lại kèm --apply để ghi vào DB.');
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const { row, repaired } of changed) {
      await client.query(
        'UPDATE help_articles SET body_html = $1, updated_at = NOW() WHERE id = $2',
        [repaired, row.id],
      );
    }
    await client.query('COMMIT');
    console.log(`\nĐã ghi ${changed.length} bài vào DB.`);
    console.log('Ảnh đã chèn được giữ nguyên. body_md không bị đụng tới.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`[RepairHelpLists] THẤT BẠI: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
