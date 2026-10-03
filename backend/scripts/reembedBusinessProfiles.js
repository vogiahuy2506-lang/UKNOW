/**
 * Một lần: embed lại hồ sơ cho chủ shop CÓ sản phẩm đang bán nhưng CHƯA có chunk `field = 'products'`
 * trong `business_profile_chunks` (sản phẩm thêm trước khi có đường reembed → RAG không thấy sản phẩm).
 *
 * "Đang bán" dùng đúng `productRepository.findAllByUser(userId, { activeOnly: true })` — không có luật thứ hai.
 *
 * Mặc định CHỈ LIỆT KÊ. Thêm `--apply` mới gọi `businessProfileService.reembedChunks(userId)` (tốn lượt embedding).
 *
 *   docker exec uknow-campaign-backend node scripts/reembedBusinessProfiles.js            # liệt kê
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

export async function run({ apply = false, db, productRepository, businessProfileService, log = console.log }) {
  const before = await findOwnersMissingProductChunks({ db, productRepository });
  log(`Chủ shop thiếu chunk products (trước): ${before.length}${before.length ? ` — ${before.join(', ')}` : ''}`);
  if (!apply) {
    log('Chế độ liệt kê — không ghi gì. Thêm --apply để embed lại.');
    return { before: before.length, after: null, reembedded: [] };
  }
  const reembedded = [];
  for (const userId of before) {
    await businessProfileService.reembedChunks(userId);
    reembedded.push(userId);
    log(`  đã embed lại user ${userId}`);
  }
  const after = await findOwnersMissingProductChunks({ db, productRepository });
  log(`Chủ shop thiếu chunk products (sau): ${after.length}${after.length ? ` — ${after.join(', ')}` : ''}`);
  return { before: before.length, after: after.length, reembedded };
}

async function main() {
  await import('dotenv/config');
  const { default: db } = await import('../src/config/database.js');
  const { default: productRepository } = await import('../src/repositories/products/product.repository.js');
  const { default: businessProfileService } = await import('../src/services/ai/businessProfile.service.js');
  try {
    await run({ apply: process.argv.includes('--apply'), db, productRepository, businessProfileService });
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
