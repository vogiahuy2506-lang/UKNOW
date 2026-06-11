/**
 * Script để lấy thông tin tài khoản super_admin.
 * Chạy: cd backend && node scripts/get-superadmin.js
 */
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

async function getSuperAdmin() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, username, email, full_name, role, status, created_at
       FROM users
       WHERE role = 'super_admin'
       ORDER BY created_at ASC
       LIMIT 5`
    );

    if (rows.length === 0) {
      console.log('❌ Không tìm thấy tài khoản super_admin nào.');
      return;
    }

    console.log('\n👑 TÀI KHOẢN SUPER_ADMIN:\n');
    rows.forEach((u, i) => {
      console.log(`  [${i + 1}] Username: ${u.username}`);
      console.log(`      Email:    ${u.email}`);
      console.log(`      FullName: ${u.full_name || '(chưa có)'}`);
      console.log(`      Status:   ${u.status}`);
      console.log(`      Created:  ${new Date(u.created_at).toLocaleString('vi-VN')}`);
      console.log('      ---');
    });

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

getSuperAdmin();
