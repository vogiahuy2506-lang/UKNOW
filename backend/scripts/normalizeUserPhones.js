/**
 * Chuẩn hoá `users.phone` về đúng dạng mà ứng dụng dùng (normalizePhoneForZaloCampaign)
 * TRƯỚC KHI chạy migration 179 (idx_users_phone_unique). Một nguồn sự thật duy nhất —
 * KHÔNG viết SQL chuẩn hoá riêng, xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 1.1
 * và Bẫy #1 (SQL viết tay từng lệch hàm JS ở 2 chỗ, để lại số trùng lọt qua UNIQUE).
 *
 * --dry-run (mặc định): đọc toàn bộ users có phone, chuẩn hoá, in ra bao nhiêu dòng sẽ
 *   đổi và MỌI nhóm bị trùng sau chuẩn hoá (kèm id + email). Không ghi gì.
 * --apply: ghi giá trị đã chuẩn hoá về DB; phone rỗng sau chuẩn hoá → NULL.
 *   TỪ CHỐI CHẠY nếu còn nhóm trùng — thoát mã khác 0.
 *
 * Thứ tự bắt buộc khi lên production:
 *   1. node backend/scripts/normalizeUserPhones.js --dry-run
 *   2. Còn nhóm trùng → dừng, báo sếp chọn giữ tài khoản nào.
 *   3. node backend/scripts/normalizeUserPhones.js --apply
 *   4. Deploy (migration 179 chạy, tạo UNIQUE INDEX).
 *
 * Chạy: cd backend && node scripts/normalizeUserPhones.js [--dry-run|--apply]
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { normalizePhoneForZaloCampaign } from '../src/utils/zaloPhoneCampaign.util.js';

const apply = process.argv.includes('--apply');

const { rows } = await db.query(
  `SELECT id, email, phone FROM users WHERE phone IS NOT NULL AND phone <> '' ORDER BY id`
);

const changes = []; // { id, email, from, to }
const groups = new Map(); // normalized -> [{ id, email }]

for (const row of rows) {
  const normalized = normalizePhoneForZaloCampaign(row.phone);
  if (normalized !== row.phone) {
    changes.push({ id: row.id, email: row.email, from: row.phone, to: normalized || '(rỗng → NULL)' });
  }
  if (!normalized) continue; // chuẩn hoá ra rỗng → sẽ thành NULL, không tính vào nhóm trùng
  if (!groups.has(normalized)) groups.set(normalized, []);
  groups.get(normalized).push({ id: row.id, email: row.email });
}

const duplicateGroups = [...groups.entries()].filter(([, members]) => members.length > 1);

console.log(`Tổng số user có phone: ${rows.length}`);
console.log(`Số dòng sẽ đổi giá trị sau chuẩn hoá: ${changes.length}`);
if (changes.length > 0) {
  console.table(changes);
}

if (duplicateGroups.length > 0) {
  console.log(`\n⚠️  ${duplicateGroups.length} nhóm SĐT bị TRÙNG sau chuẩn hoá:`);
  for (const [normalized, members] of duplicateGroups) {
    console.log(`  ${normalized}:`);
    for (const m of members) console.log(`    - id=${m.id} email=${m.email}`);
  }
} else {
  console.log('\n✔ Không có nhóm SĐT nào trùng sau chuẩn hoá.');
}

if (!apply) {
  console.log('\n(--dry-run, không ghi gì. Chạy lại với --apply để ghi vào DB.)');
  process.exit(duplicateGroups.length > 0 ? 1 : 0);
}

if (duplicateGroups.length > 0) {
  console.error('\n✘ TỪ CHỐI --apply: còn nhóm SĐT trùng ở trên. Xử lý xong (đổi số hoặc xoá) rồi chạy lại.');
  process.exit(1);
}

let updated = 0;
for (const c of changes) {
  const value = c.to === '(rỗng → NULL)' ? null : c.to;
  await db.query('UPDATE users SET phone = $1 WHERE id = $2', [value, c.id]);
  updated += 1;
}

console.log(`\n✔ Đã ghi ${updated} dòng. Sẵn sàng chạy migration 179.`);
process.exit(0);
