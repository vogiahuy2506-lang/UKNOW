/**
 * Nạp dữ liệu thành viên đã đăng ký từ trước sang Google Sheet, sau khi PR-2
 * (đồng bộ Google Sheet) deploy. Xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 2.5.
 *
 * Điều kiện lọc PHẢI khớp chính xác với đường realtime (auth.controller.js `register`,
 * user.controller.js `updatePhone`): role='user' VÀ không đang là nhân viên active của
 * ai (bảng user_members — role='employee' không tồn tại trong sản phẩm, xem Bẫy #5b).
 * Lệch điều kiện này thì backfill và realtime cho ra hai tập khác nhau.
 *
 * Chạy lại được nhiều lần an toàn — Apps Script upsert theo email (mục 2.4), hỏng
 * giữa chừng thì cứ chạy lại từ đầu.
 *
 * Chạy: cd backend && node scripts/backfillMemberSheet.js
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { pushMemberToSheet } from '../src/utils/memberSheetSync.util.js';

const DELAY_BETWEEN_PUSHES_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!process.env.MEMBER_SHEET_WEBHOOK_URL) {
  console.error('✘ Chưa cấu hình MEMBER_SHEET_WEBHOOK_URL trong .env — dừng, không có gì để nạp vào.');
  process.exit(1);
}

const { rows } = await db.query(`
  SELECT u.id, u.email, u.phone, u.full_name, u.created_at
  FROM users u
  WHERE u.phone IS NOT NULL
    AND u.role = 'user'
    AND NOT EXISTS (
          SELECT 1 FROM user_members um
          WHERE um.employee_id = u.id AND um.status = 'active'
        )
  ORDER BY u.id
`);

console.log(`Tìm thấy ${rows.length} thành viên đủ điều kiện đưa vào Sheet.`);

let ok = 0;
let failed = 0;

for (const row of rows) {
  try {
    // eslint-disable-next-line no-await-in-loop
    await pushMemberToSheet({
      email: row.email,
      phone: row.phone,
      fullName: row.full_name,
      createdAt: row.created_at,
    });
    ok += 1;
  } catch (err) {
    failed += 1;
    console.warn(`  ✘ id=${row.id} email=${row.email}: ${err.message}`);
  }
  // eslint-disable-next-line no-await-in-loop
  await sleep(DELAY_BETWEEN_PUSHES_MS);
}

console.log(`\n✔ Xong: ${ok} thành công, ${failed} thất bại / ${rows.length} tổng.`);
if (failed > 0) {
  console.log('Chạy lại script này để thử lại — Apps Script upsert theo email, không sinh dòng trùng.');
}
process.exit(failed > 0 ? 1 : 0);
