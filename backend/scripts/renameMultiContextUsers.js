/**
 * One-time: bỏ suffix "(Employee only)" / "(Multi-context)" khỏi full_name của bob & alice
 * để hiển thị gọn trên Context Switcher.
 *
 * Chạy: cd backend && node scripts/renameMultiContextUsers.js
 */
import 'dotenv/config';
import db from '../src/config/database.js';

const updates = [
  { email: 'alice@multi.test', fullName: 'Alice' },
  { email: 'bob@multi.test',   fullName: 'Bob'   },
];

for (const { email, fullName } of updates) {
  const { rowCount } = await db.query(
    `UPDATE users SET full_name = $1, updated_at = NOW() WHERE email = $2`,
    [fullName, email]
  );
  console.log(rowCount > 0 ? `✓ ${email} → ${fullName}` : `↷ ${email} không tồn tại`);
}

process.exit(0);
