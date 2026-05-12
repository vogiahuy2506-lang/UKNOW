/**
 * One-time backfill: chuyển semantic của `plans.is_active` cho custom plan.
 *
 * Trước đây: custom plan luôn `is_active = false` để ẩn khỏi pricing công khai.
 *   → Trộn lẫn ý nghĩa "ẩn khỏi pricing" và "đã bị xoá".
 * Sau khi refactor: pricing tự filter `is_custom = false`, nên semantic của `is_active`
 *   thuần là "không bị admin xoá". Custom plan đang phục vụ khách phải có `is_active = TRUE`.
 *
 * Script này flip `is_active = TRUE` cho mọi custom plan đang được user dùng
 * (active_plan_id) HOẶC có order success. Các custom plan orphan (không user, không order
 * thành công) được coi như "đã bị xoá" và giữ nguyên `is_active = false`.
 *
 * Chạy: cd backend && node scripts/backfillCustomPlanActive.js
 */
import 'dotenv/config';
import db from '../src/config/database.js';

const { rows: candidates } = await db.query(`
  SELECT p.id, p.name, p.is_active,
         (SELECT COUNT(*) FROM users u WHERE u.active_plan_id = p.id)::int       AS user_count,
         (SELECT COUNT(*) FROM orders o WHERE o.plan_id = p.id AND o.status = 'success')::int AS paid_order_count
    FROM plans p
   WHERE p.is_custom = TRUE
     AND p.is_active = FALSE
   ORDER BY p.id
`);

if (candidates.length === 0) {
  console.log('✔ Không có custom plan nào cần backfill.');
  process.exit(0);
}

console.log(`Tìm thấy ${candidates.length} custom plan đang ở is_active = false:`);
console.table(candidates);

const toRestore = candidates.filter((p) => p.user_count > 0 || p.paid_order_count > 0);

if (toRestore.length === 0) {
  console.log('Không có plan nào đang được dùng — giữ nguyên trạng thái "đã ẩn".');
  process.exit(0);
}

const ids = toRestore.map((p) => p.id);
const { rows: updated } = await db.query(
  `UPDATE plans SET is_active = TRUE, updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING id, name`,
  [ids]
);

console.log(`\n✔ Đã khôi phục is_active = true cho ${updated.length} plan đang phục vụ khách:`);
console.table(updated);

process.exit(0);
