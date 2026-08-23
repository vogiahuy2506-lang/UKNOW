#!/usr/bin/env node
/**
 * Khôi phục ảnh cho bài hướng dẫn tiếng Việt bằng cách lấy lại từ bản tiếng Anh.
 *
 * Bối cảnh và cách ghép: xem đầu file src/utils/helpImageRecovery.util.js.
 * Tóm tắt: nút "Seed" ghi đè body_html bản 'vi' và xoá sạch ảnh admin đã chèn;
 * bản 'en' không bị đụng nên vẫn giữ cả ảnh lẫn vị trí của chúng.
 *
 *   node scripts/recoverHelpImagesFromEn.js            # chỉ chẩn đoán, KHÔNG ghi
 *   node scripts/recoverHelpImagesFromEn.js -v         # kèm chi tiết từng tấm ảnh
 *   node scripts/recoverHelpImagesFromEn.js --apply    # ghi vào DB
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { stripTags, extractImageSrcs } from '../src/utils/helpArticleListRepair.util.js';
import { planImageRecovery } from '../src/utils/helpImageRecovery.util.js';

const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');

const shortSrc = (src) => String(src || '').split('/').pop() || '(không có src)';

async function main() {
  const { rows } = await db.query(
    `SELECT id, slug, locale, body_html FROM help_articles
      WHERE body_html IS NOT NULL AND body_html <> ''
      ORDER BY slug, locale`,
  );

  const bySlug = new Map();
  for (const row of rows) {
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, {});
    bySlug.get(row.slug)[row.locale] = row;
  }

  const planned = [];
  let totalSkipped = 0;

  for (const [slug, pair] of bySlug) {
    const { vi, en } = pair;
    if (!vi || !en) continue;
    if (extractImageSrcs(vi.body_html).length > 0) continue;   // VI còn ảnh — không đụng
    const enImages = extractImageSrcs(en.body_html);
    if (enImages.length === 0) continue;                        // EN cũng không có gì để lấy

    const plan = planImageRecovery(vi.body_html, en.body_html);

    if (!plan.ok) {
      console.log(`  ✗ ${slug}: ${plan.reason} (bản EN có ${enImages.length} ảnh)`);
      totalSkipped += enImages.length;
      if (verbose) {
        for (const item of plan.skipped) console.log(`        · ${shortSrc(item.src)} — ${item.reason}`);
      }
      continue;
    }

    // Hai chốt chặn trước khi cho ghi: chữ tiếng Việt không đổi (ngoài các chú
    // thích "[ẢNH: …]" bị thay bằng chính tấm ảnh đó), và danh sách ảnh sau khi
    // ghép đúng bằng những tấm đã nhận. stripTags mù với <img> nên phải kiểm cả hai.
    if (stripTags(plan.html) !== stripTags(plan.textReference)) {
      console.log(`  ✗ ${slug}: chữ tiếng Việt bị đổi — bỏ qua`);
      totalSkipped += enImages.length;
      continue;
    }
    const expected = plan.restored.map((r) => r.src);
    if (extractImageSrcs(plan.html).join(' ') !== expected.join(' ')) {
      console.log(`  ✗ ${slug}: danh sách ảnh sau khi ghép không khớp dự kiến — bỏ qua`);
      totalSkipped += enImages.length;
      continue;
    }

    const captionsReplaced = plan.restored.filter((r) => r.replacedCaption).length;
    const note = plan.skipped.length ? `, còn ${plan.skipped.length} tấm chưa đặt được` : '';
    console.log(
      `  ✓ ${slug}: đặt lại ${plan.restored.length}/${enImages.length} ảnh`
      + ` (${captionsReplaced} tấm thay chỗ chú thích, khung khớp ${Math.round(plan.coverage * 100)}%)${note}`,
    );
    if (verbose) {
      for (const item of plan.restored) console.log(`        ✓ ${shortSrc(item.src)}`);
      for (const item of plan.skipped) console.log(`        · ${shortSrc(item.src)} — ${item.reason}`);
    }
    totalSkipped += plan.skipped.length;
    planned.push({ id: vi.id, slug, newHtml: plan.html, count: plan.restored.length });
  }

  if (!planned.length) {
    console.log(`\nKhông có bài nào ghép được tự động (${totalSkipped} ảnh chưa đặt lại được).`);
    return;
  }
  const total = planned.reduce((sum, item) => sum + item.count, 0);
  console.log(`\n${planned.length} bài / ${total} ảnh sẵn sàng khôi phục.`);
  if (totalSkipped) console.log(`${totalSkipped} ảnh phải chèn tay (lý do in ở trên, chạy kèm -v để xem từng tấm).`);

  if (!apply) {
    console.log('Mới chỉ chẩn đoán, CHƯA ghi gì. Chạy lại kèm --apply để ghi vào DB.');
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const item of planned) {
      await client.query(
        'UPDATE help_articles SET body_html = $1, updated_at = NOW() WHERE id = $2',
        [item.newHtml, item.id],
      );
    }
    await client.query('COMMIT');
    console.log(`\nĐã khôi phục ${total} ảnh cho ${planned.length} bài.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`[RecoverHelpImages] THẤT BẠI: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => { await db.pool.end(); });
