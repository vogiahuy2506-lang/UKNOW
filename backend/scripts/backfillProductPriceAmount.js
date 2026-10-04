#!/usr/bin/env node
/**
 * Một lần: điền `products.price_amount` (migration 280) từ chuỗi giá hiển thị `price` cho các dòng còn NULL.
 * Chỉ điền khi `parseVndPrice` ĐỌC ĐƯỢC chắc chắn ("500k", "1,5tr", "1.200.000đ", "Miễn phí"); mơ hồ ("Liên hệ",
 * "từ 500k", "500k-1tr") để NULL và chỉ liệt kê để người dùng tự nhập.
 *
 * Mặc định CHỈ LIỆT KÊ (không ghi). Thêm --apply để ghi. Chạy lại an toàn (chỉ đụng dòng price_amount IS NULL).
 *
 * Usage:
 *   node scripts/backfillProductPriceAmount.js            # liệt kê
 *   node scripts/backfillProductPriceAmount.js --apply    # ghi
 * Trên VPS:
 *   docker exec uknow-campaign-backend node scripts/backfillProductPriceAmount.js
 *   docker exec uknow-campaign-backend node scripts/backfillProductPriceAmount.js --apply
 */
import db from '../src/config/database.js';
import { parseVndPrice } from '../src/utils/parseVndPrice.util.js';

const apply = process.argv.includes('--apply');

async function run() {
  const { rows } = await db.query(
    `SELECT id, COALESCE(workspace_owner_id, id_user) AS owner_id, product_name, price
     FROM products
     WHERE price_amount IS NULL AND price IS NOT NULL AND BTRIM(price) <> ''
     ORDER BY id`
  );
  let readable = 0;
  let unreadable = 0;
  let written = 0;
  for (const r of rows) {
    const amount = parseVndPrice(r.price);
    if (amount === null) {
      unreadable += 1;
      console.log(`[price-backfill] BO QUA #${r.id} (chu ${r.owner_id}) "${r.product_name}": gia "${r.price}" khong doc chac duoc`);
      continue;
    }
    readable += 1;
    console.log(`[price-backfill] ${apply ? 'GHI' : 'SE GHI'} #${r.id} (chu ${r.owner_id}) "${r.product_name}": "${r.price}" -> ${amount}`);
    if (apply) {
      const res = await db.query(`UPDATE products SET price_amount = $1 WHERE id = $2 AND price_amount IS NULL`, [amount, r.id]);
      written += res.rowCount || 0;
    }
  }
  console.log(
    `[price-backfill] Xong. dong NULL co chu gia=${rows.length}, doc duoc=${readable}, khong doc duoc=${unreadable}` +
      (apply ? `, da ghi=${written}` : ' (chi liet ke — them --apply de ghi)')
  );
}

(async () => {
  try {
    await run();
    await db.pool.end();
  } catch (err) {
    console.error('[price-backfill] FATAL:', err);
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
})();
