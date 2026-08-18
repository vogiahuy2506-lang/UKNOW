/**
 * Script reset password cho bất kỳ user nào (theo username).
 * Chạy: cd backend && node scripts/reset-user-password.js <username> <password_moi>
 *
 * Ví dụ: node scripts/reset-user-password.js hoangphuc0501 admin123
 *
 * - Hash bằng bcrypt salt 10 (khớp auth.controller.js).
 * - Reset failed_login_attempts = 0, locked_until = NULL (gỡ lockout).
 * - Thu hồi mọi refresh token của user (logout mọi thiết bị đang đăng nhập).
 * - Không thay đổi email, role, status hay bất kỳ cột nào khác.
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const dbHost = process.env.DB_HOST || 'localhost';
const needsSsl =
  process.env.DB_SSL === 'true' ||
  String(dbHost).includes('neon.tech');

const pool = new Pool({
  host:     dbHost,
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'uknow-campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_WORD     || process.env.DB_PASSWORD || '',
  ssl:      needsSsl ? { rejectUnauthorized: false } : false,
});

async function resetPassword(username, newPassword) {
  if (!username) {
    console.error('❌ Thiếu username.');
    console.error('   Cú pháp: node scripts/reset-user-password.js <username> <password_moi>');
    process.exit(1);
  }
  if (!newPassword || newPassword.length < 6) {
    console.error('❌ Password phải có ít nhất 6 ký tự.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(
      `SELECT id, username, email, status, role,
              failed_login_attempts, locked_until
       FROM users WHERE username = $1 LIMIT 1`,
      [username]
    );

    if (existing.length === 0) {
      console.error(`❌ Không tìm thấy user có username = '${username}'.`);
      process.exit(1);
    }

    const user = existing[0];
    console.log(`\n👤 Tìm thấy: ${user.username} (${user.email})`);
    console.log(`   id              : ${user.id}`);
    console.log(`   role            : ${user.role}`);
    console.log(`   status          : ${user.status}`);
    console.log(`   failed_attempts : ${user.failed_login_attempts}`);
    console.log(`   locked_until    : ${user.locked_until}`);

    // Hash theo cùng salt mà controller đang dùng (10)
    const hash = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hash, user.id]
    );

    // Thu hồi refresh tokens (mọi thiết bị phải login lại)
    const revokeRes = await client.query(
      `UPDATE refresh_tokens
       SET is_revoked = TRUE,
           revoked_at = NOW(),
           revoked_reason = 'password_reset'
       WHERE id_user = $1 AND is_revoked = FALSE`,
      [user.id]
    );

    console.log(`\n✅ Reset mật khẩu thành công.`);
    console.log(`   Username : ${user.username}`);
    console.log(`   Email    : ${user.email}`);
    console.log(`   Password : ${newPassword}`);
    console.log(`   Thu hồi  : ${revokeRes.rowCount} refresh token(s) — tất cả thiết bị sẽ bị đăng xuất.`);
    console.log(`\n⚠️  Hãy đăng nhập ngay rồi đổi lại password mạnh hơn!\n`);
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetPassword(process.argv[2], process.argv[3]);
