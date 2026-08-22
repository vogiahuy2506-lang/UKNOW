#!/usr/bin/env node
/**
 * Vá danh sách đánh số bị cắt rời trong body_html của bài hướng dẫn ĐANG NẰM
 * TRONG DB, giữ nguyên ảnh admin đã chèn.
 *
 * Dùng khi nào: bài hướng dẫn hiện số thứ tự 1 / 1 / 1 thay vì 1 / 2 / 3 vì mỗi
 * chú thích ảnh cắt <ol> làm đôi. Bộ chuyển Markdown→HTML đã được sửa, nhưng
 * HTML sinh ra trước đó thì đã nằm sẵn trong DB.
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
  repairSplitOrderedLists,
  countOrderedLists,
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
    const repaired = repairSplitOrderedLists(row.body_html);
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
    const before = countOrderedLists(row.body_html);
    const after = countOrderedLists(repaired);
    console.log(`  #${row.id} ${row.slug} (${row.locale}) — số khối <ol>: ${before} -> ${after}`);
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
