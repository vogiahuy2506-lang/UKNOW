/**
 * Script để lấy thông tin tất cả users (debug).
 * Chạy: cd backend && node scripts/get-users.js
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

async function getUsers() {
  const client = await pool.connect();
  try {
    // Lấy tất cả roles hiện có
    const { rows: roles } = await client.query(`SELECT DISTINCT role FROM users ORDER BY role`);
    console.log('\n📋 Các role hiện có:', roles.map(r => r.role).join(', '));

    // Lấy tất cả users
    const { rows } = await client.query(
      `SELECT id, username, email, full_name, role, status, created_at
       FROM users
       ORDER BY created_at ASC
       LIMIT 20`
    );

    if (rows.length === 0) {
      console.log('\n❌ Không tìm thấy user nào.');
      return;
    }

    console.log(`\n👥 TỔNG CỘNG: ${rows.length} users\n`);
    rows.forEach((u, i) => {
      console.log(`  [${i + 1}] Username: ${u.username}`);
      console.log(`      Email:    ${u.email}`);
      console.log(`      FullName: ${u.full_name || '(chưa có)'}`);
      console.log(`      Role:     ${u.role}`);
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

getUsers();
