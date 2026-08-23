#!/usr/bin/env node
/**
 * Khôi phục ảnh cho bài hướng dẫn tiếng Việt bằng cách lấy lại từ bản tiếng Anh.
 *
 * Bối cảnh (22/08/2026): nút "Seed" ghi đè body_html của mọi bài mẫu bằng bản
 * trong repo, xoá sạch ảnh admin đã chèn tay. Nhưng seedHelpArticles() chỉ đụng
 * `locale = 'vi'` — bản 'en' (dịch từ bản VI SAU khi đã chèn ảnh) vẫn còn nguyên
 * thẻ <img> ở đúng vị trí. Đây là nguồn duy nhất còn lưu "ảnh nào nằm ở bước nào",
 * vì storage_objects không giữ liên kết ảnh ↔ bài (nó dò ngược từ body_html).
 *
 * Cách ghép: cắt cả hai bản thành dãy khối cấp cao nhất rồi so theo chỉ số. Hai
 * bản cùng một khung HTML (bản EN dịch từ bản VI) nên khối thứ N của hai bên là
 * cùng một vị trí trong bài. Chỗ nào bản EN là <img> thì chèn đúng thẻ đó vào
 * bản VI, thay cho khối chú thích "[ẢNH: ...]" tương ứng.
 *
 *   node scripts/recoverHelpImagesFromEn.js           # chỉ chẩn đoán, KHÔNG ghi
 *   node scripts/recoverHelpImagesFromEn.js --apply   # ghi vào DB
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { stripTags, extractImageSrcs } from '../src/utils/helpArticleListRepair.util.js';

const apply = process.argv.includes('--apply');

/** Cắt HTML thành dãy khối cấp cao nhất (không đi vào bên trong khối). */
function splitTopLevelBlocks(html) {
  const blocks = [];
  const re = /<(h[1-6]|p|ol|ul|table|blockquote|pre|figure|img|hr)\b[^>]*>/gi;
  let match;
  let cursor = 0;
  while ((match = re.exec(html)) !== null) {
    if (match.index < cursor) continue;
    const tag = match[1].toLowerCase();
    let end;
    if (tag === 'img' || tag === 'hr') {
      end = match.index + match[0].length;
    } else {
      // Tìm thẻ đóng tương ứng, có tính lồng nhau cùng tên thẻ.
      const nested = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
      nested.lastIndex = match.index;
      let depth = 0;
      let m2;
      end = html.length;
      while ((m2 = nested.exec(html)) !== null) {
        depth += m2[1] === '/' ? -1 : 1;
        if (depth === 0) { end = m2.index + m2[0].length; break; }
      }
    }
    blocks.push({ tag, html: html.slice(match.index, end) });
    cursor = end;
    re.lastIndex = end;
  }
  return blocks;
}

/** Khối này là chú thích ảnh chờ được thay? (vd <p>[ẢNH: ...]</p>) */
function isPlaceholderBlock(block) {
  return block.tag === 'p' && /\[ẢNH:/i.test(block.html);
}

async function main() {
  const { rows } = await db.query(
    `SELECT id, slug, locale, body_html FROM help_articles
      WHERE body_html IS NOT NULL AND body_html <> ''
      ORDER BY slug, locale`,
  );

  const bySlug = new Map();
  for (const r of rows) {
    if (!bySlug.has(r.slug)) bySlug.set(r.slug, {});
    bySlug.get(r.slug)[r.locale] = r;
  }

  const planned = [];
  for (const [slug, pair] of bySlug) {
    const vi = pair.vi;
    const en = pair.en;
    if (!vi || !en) continue;
    if (extractImageSrcs(vi.body_html).length > 0) continue;   // VI còn ảnh — bỏ qua
    const enImages = extractImageSrcs(en.body_html);
    if (enImages.length === 0) continue;                        // EN cũng không có gì để lấy

    const viBlocks = splitTopLevelBlocks(vi.body_html);
    const enBlocks = splitTopLevelBlocks(en.body_html);

    if (viBlocks.length !== enBlocks.length) {
      console.log(`  ✗ ${slug}: KHUNG LỆCH (vi ${viBlocks.length} khối, en ${enBlocks.length} khối) — không ghép tự động được`);
      continue;
    }

    // Chỗ nào bản EN là <img> thì lấy thẻ đó đặt vào đúng chỉ số bên VI.
    let replaced = 0;
    let mismatched = 0;
    const outBlocks = viBlocks.map((vb, i) => {
      const eb = enBlocks[i];
      if (eb.tag !== 'img') return vb.html;
      // Bên VI vị trí đó phải là chú thích ảnh (hoặc cũng là <img>) mới hợp lý.
      if (!isPlaceholderBlock(vb) && vb.tag !== 'img') { mismatched += 1; return vb.html; }
      replaced += 1;
      return eb.html;
    });

    if (mismatched > 0) {
      console.log(`  ✗ ${slug}: ${mismatched} vị trí ảnh bên EN không khớp chú thích bên VI — bỏ qua cho an toàn`);
      continue;
    }
    if (replaced !== enImages.length) {
      console.log(`  ✗ ${slug}: chỉ ghép được ${replaced}/${enImages.length} ảnh (ảnh nằm lồng trong khối khác) — bỏ qua`);
      continue;
    }

    const newHtml = outBlocks.join('');
    if (stripTags(newHtml) !== stripTags(vi.body_html)) {
      console.log(`  ✗ ${slug}: chữ tiếng Việt bị đổi — bỏ qua`);
      continue;
    }
    const newSrcs = extractImageSrcs(newHtml);
    if (newSrcs.join(' ') !== enImages.join(' ')) {
      console.log(`  ✗ ${slug}: danh sách ảnh sau khi ghép không khớp bản EN — bỏ qua`);
      continue;
    }

    console.log(`  ✓ ${slug}: ghép được ${replaced} ảnh vào bản tiếng Việt`);
    planned.push({ id: vi.id, slug, newHtml, count: replaced });
  }

  if (!planned.length) {
    console.log('\nKhông có bài nào ghép được tự động.');
    return;
  }
  const total = planned.reduce((n, p) => n + p.count, 0);
  console.log(`\n${planned.length} bài / ${total} ảnh sẵn sàng khôi phục.`);

  if (!apply) {
    console.log('Mới chỉ chẩn đoán, CHƯA ghi gì. Chạy lại kèm --apply để ghi vào DB.');
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const p of planned) {
      await client.query(
        'UPDATE help_articles SET body_html = $1, updated_at = NOW() WHERE id = $2',
        [p.newHtml, p.id],
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
