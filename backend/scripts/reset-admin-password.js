/**
 * Script để reset password cho admin@uknow.com
 * Chạy: cd backend && node scripts/reset-admin-password.js <password_moi>
 *
 * Ví dụ: node scripts/reset-admin-password.js MyNewPass@123
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'uknow-campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_WORD     || process.env.DB_PASSWORD || '',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function resetPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    console.error('❌ Password phải có ít nhất 6 ký tự.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // 1. Verify admin exists
    const { rows: existing } = await client.query(
      `SELECT id, username, email FROM users WHERE email = 'admin@uknow.com' LIMIT 1`
    );

    if (existing.length === 0) {
      console.error('❌ Không tìm thấy user admin@uknow.com');
      process.exit(1);
    }

    const admin = existing[0];
    console.log(`\n👤 Tìm thấy: ${admin.username} (${admin.email})`);

    // 2. Hash password
    const hash = await bcrypt.hash(newPassword, 10);

    // 3. Update password
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2`,
      [hash, 'admin@uknow.com']
    );

    console.log(`\n✅ Đã đổi password thành công!`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n⚠️  Hãy đăng nhập ngay và đổi lại password!`);

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const newPassword = process.argv[2];
if (!newPassword) {
  console.error('❌ Vui lòng nhập password mới.');
  console.error('   Ví dụ: node scripts/reset-admin-password.js MyNewPass@123');
  process.exit(1);
}

resetPassword(newPassword);
