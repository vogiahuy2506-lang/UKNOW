/**
 * One-time cleanup: gỡ active_plan_id của user đang trỏ về custom plan đã bị soft-delete.
 *
 * Bối cảnh: trước khi service `removePlan` có nhánh tự động unassign user khi xoá
 * custom plan, một số custom plan đã bị soft-delete mà user vẫn giữ active_plan_id
 * cũ → user vẫn được phục vụ với plan đã ẩn. Script này dọn các bản ghi orphan đó.
 *
 * Chạy: cd backend && node scripts/cleanupOrphanedCustomPlans.js
 */
import 'dotenv/config';
import db from '../src/config/database.js';

const { rows: orphans } = await db.query(`
  SELECT u.id, u.email, u.active_plan_id, p.name AS plan_name
    FROM users u
    JOIN plans p ON p.id = u.active_plan_id
   WHERE p.is_custom = TRUE AND p.is_active = FALSE
`);

if (orphans.length === 0) {
  console.log('✔ Không có user nào đang giữ custom plan đã ẩn. Không cần dọn.');
  process.exit(0);
}

console.log(`Tìm thấy ${orphans.length} user đang giữ custom plan đã ẩn:`);
console.table(orphans);

const { rows: updated } = await db.query(`
  UPDATE users
     SET active_plan_id = NULL, updated_at = NOW()
   WHERE active_plan_id IN (
     SELECT id FROM plans WHERE is_custom = TRUE AND is_active = FALSE
   )
  RETURNING id, email
`);

console.log(`\n✔ Đã gỡ active_plan_id cho ${updated.length} user:`);
console.table(updated);

process.exit(0);
