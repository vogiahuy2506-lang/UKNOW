/**
 * Một lần: embed lại hồ sơ cho chủ shop có chunk RAG sản phẩm (`field = 'products'` trong `business_profile_chunks`) SAI:
 *   (1) THIẾU  — có sản phẩm đang bán nhưng chưa có chunk (sản phẩm thêm trước khi có đường reembed → RAG không thấy sản phẩm);
 *   (2) LỖI THỜI (EXTRA-C3) — có chunk nhưng nội dung khác danh sách sản phẩm ĐANG BÁN hiện tại (còn sản phẩm đã ngừng
 *       bán / đã xoá, hoặc chunk nhúng trước khi có bộ lọc activeOnly). Bản cũ của script KHÔNG thấy nhóm này.
 *
 * "Đang bán" dùng đúng `productRepository.findAllByUser(userId, { activeOnly: true })` — không có luật thứ hai. Nội dung
 * chunk mong đợi do `buildProductsChunkText` (businessProfile.service) dựng — cùng hàm đường ghi chunk dùng.
 *
 * Mặc định CHỈ LIỆT KÊ (dry-run, không ghi, không tốn embedding). Thêm `--apply` mới gọi
 * `businessProfileService.reembedChunks(userId)` cho nhóm (1) + (2) (tốn lượt embedding).
 *
 *   docker exec uknow-campaign-backend node scripts/reembedBusinessProfiles.js            # liệt kê (dry-run)
 *   docker exec uknow-campaign-backend node scripts/reembedBusinessProfiles.js --apply    # ghi
 */
import { fileURLToPath } from 'node:url';

/** Chủ shop có ≥1 sản phẩm đang bán mà chưa có chunk products. */
export async function findOwnersMissingProductChunks({ db, productRepository }) {
  const owners = await db.query(
    `SELECT DISTINCT COALESCE(workspace_owner_id, id_user) AS owner_id
     FROM products
     WHERE COALESCE(workspace_owner_id, id_user) IS NOT NULL
     ORDER BY 1`
  );
  const missing = [];
  for (const { owner_id: ownerId } of owners.rows) {
    const active = await productRepository.findAllByUser(ownerId, { activeOnly: true });
    if (!active.length) continue;
    const chunk = await db.query(
      `SELECT 1 FROM business_profile_chunks WHERE user_id = $1 AND metadata->>'field' = 'products' LIMIT 1`,
      [ownerId]
    );
    if (chunk.rows.length === 0) missing.push(ownerId);
  }
  return missing;
}

/**
 * Chủ shop CÓ chunk products nhưng nội dung không khớp danh sách sản phẩm đang bán hiện tại (EXTRA-C3).
 * Không tính người THIẾU chunk (đã thuộc `findOwnersMissingProductChunks`).
 * Khớp = đúng MỘT chunk products và `chunk_text` bằng đúng `buildProductsChunkText(sản phẩm đang bán)`.
 * Không còn sản phẩm đang bán nào mà vẫn còn chunk → lỗi thời (reembed sẽ xoá chunk).
 */
export async function findOwnersWithStaleProductChunks({ db, productRepository, buildProductsChunkText }) {
  const owners = await db.query(
    `SELECT DISTINCT owner_id FROM (
       SELECT COALESCE(workspace_owner_id, id_user) AS owner_id FROM products
       UNION
       SELECT user_id AS owner_id FROM business_profile_chunks WHERE metadata->>'field' = 'products'
     ) o
     WHERE owner_id IS NOT NULL
     ORDER BY 1`
  );
  const stale = [];
  for (const { owner_id: ownerId } of owners.rows) {
    const chunks = await db.query(
      `SELECT chunk_text FROM business_profile_chunks WHERE user_id = $1 AND metadata->>'field' = 'products'`,
      [ownerId]
    );
    if (chunks.rows.length === 0) continue;
    const active = await productRepository.findAllByUser(ownerId, { activeOnly: true });
    const expected = buildProductsChunkText(active);
    const matches = Boolean(expected) && chunks.rows.length === 1 && chunks.rows[0].chunk_text === expected;
    if (!matches) stale.push(ownerId);
  }
  return stale;
}

export async function run({
  apply = false,
  db,
  productRepository,
  businessProfileService,
  buildProductsChunkText = null,
  log = console.log,
}) {
  const detect = async () => {
    const missing = await findOwnersMissingProductChunks({ db, productRepository });
    // Không có hàm dựng chunk (người gọi cũ) → chỉ tìm nhóm THIẾU như trước.
    const stale = buildProductsChunkText
      ? await findOwnersWithStaleProductChunks({ db, productRepository, buildProductsChunkText })
      : [];
    return { missing, stale };
  };
  const fmt = (ids) => `${ids.length}${ids.length ? ` — ${ids.join(', ')}` : ''}`;

  const before = await detect();
  log(`Chủ shop thiếu chunk products (trước): ${fmt(before.missing)}`);
  if (buildProductsChunkText) log(`Chủ shop có chunk products LỖI THỜI (trước): ${fmt(before.stale)}`);
  const targets = [...new Set([...before.missing, ...before.stale])].sort((a, b) => a - b);
  if (!apply) {
    log('Chế độ liệt kê — không ghi gì. Thêm --apply để embed lại.');
    return { before: before.missing.length, stale: before.stale.length, after: null, reembedded: [] };
  }
  const reembedded = [];
  for (const userId of targets) {
    await businessProfileService.reembedChunks(userId);
    reembedded.push(userId);
    log(`  đã embed lại user ${userId}`);
  }
  const after = await detect();
  log(`Chủ shop thiếu chunk products (sau): ${fmt(after.missing)}`);
  if (buildProductsChunkText) log(`Chủ shop có chunk products LỖI THỜI (sau): ${fmt(after.stale)}`);
  return { before: before.missing.length, stale: before.stale.length, after: after.missing.length + after.stale.length, reembedded };
}

async function main() {
  await import('dotenv/config');
  const { default: db } = await import('../src/config/database.js');
  const { default: productRepository } = await import('../src/repositories/products/product.repository.js');
  const { default: businessProfileService, buildProductsChunkText } = await import('../src/services/ai/businessProfile.service.js');
  try {
    await run({ apply: process.argv.includes('--apply'), db, productRepository, businessProfileService, buildProductsChunkText });
  } finally {
    await db.pool.end().catch(() => {});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
