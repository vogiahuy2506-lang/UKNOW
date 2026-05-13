/**
 * Seed test DB cho E2E.
 *
 * Quy trình:
 *   1. Verify DB_NAME chứa "_test" (chống chạy nhầm trên production)
 *   2. DROP toàn bộ schema public, recreate
 *   3. Apply bootstrap.sql (schema tối thiểu chứa ~36 tables)
 *   4. Seed 1 plan + 1 test user (active_plan_id trỏ về plan đó)
 *
 * Chạy: `node e2e/scripts/seed-test-db.js`
 * (đã được global-setup.js gọi tự động khi `playwright test` chạy)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '..', '.env.test');
const BOOTSTRAP_SQL = path.resolve(
  __dirname,
  '..',
  '..',
  'backend',
  'tests',
  'integration',
  'sql',
  'bootstrap.sql'
);

dotenv.config({ path: ENV_FILE });

function assertTestDbName(name) {
  if (!name) {
    throw new Error(
      '[e2e-seed] DB_NAME chưa được set trong e2e/.env.test. ' +
        'Sao chép e2e/.env.test.example thành .env.test trước khi chạy.'
    );
  }
  if (!/_test(\b|$)/i.test(name)) {
    throw new Error(
      `[e2e-seed] DB_NAME="${name}" KHÔNG kết thúc bằng "_test". ` +
        'Để chống xoá nhầm DB production, seed script chỉ chạy trên DB có hậu tố "_test".'
    );
  }
}

/**
 * Kết nối tới DB `postgres` mặc định và CREATE DATABASE nếu chưa có.
 * Local Postgres: cần. Cloud DB (Neon, Supabase): DB phải được tạo sẵn
 * qua dashboard, hàm này sẽ bỏ qua lỗi permission.
 */
async function ensureTestDbExists(connInfo, dbName) {
  const admin = new pg.Client({ ...connInfo, database: 'postgres' });
  try {
    await admin.connect();
  } catch (err) {
    const msg = err?.message != null ? String(err.message) : String(err);
    console.warn(
      `[e2e-seed] Không kết nối được DB "postgres" để tạo DB test (${msg}).`
    );
    console.warn(`           Giả định DB "${dbName}" đã được tạo sẵn — tiếp tục.`);
    return;
  }
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      console.log(`[e2e-seed] DB "${dbName}" chưa tồn tại — tạo mới...`);
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } catch (err) {
    console.warn(`[e2e-seed] Bỏ qua bước CREATE DATABASE: ${err.message}`);
  } finally {
    await admin.end();
  }
}

async function main() {
  const dbName = process.env.DB_NAME;
  assertTestDbName(dbName);

  if (!fs.existsSync(BOOTSTRAP_SQL)) {
    throw new Error(`[e2e-seed] Không tìm thấy bootstrap.sql tại ${BOOTSTRAP_SQL}`);
  }
  const bootstrapSql = fs.readFileSync(BOOTSTRAP_SQL, 'utf8');

  const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';
  const connInfo = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  };

  await ensureTestDbExists(connInfo, dbName);

  const client = new pg.Client({ ...connInfo, database: dbName });

  await client.connect();
  try {
    console.log(`[e2e-seed] Reset schema "${dbName}"...`);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');

    console.log('[e2e-seed] Áp dụng bootstrap.sql...');
    await client.query(bootstrapSql);

    console.log('[e2e-seed] Seed plan + test user...');
    const planResult = await client.query(
      `INSERT INTO plans (code, name, price, description, is_active, max_employees, daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit)
       VALUES ('e2e_test_plan', 'E2E Test Plan', 0, 'Plan dùng cho E2E test', TRUE, 5, 1000, 30000, 500, 15000)
       RETURNING id`
    );
    const planId = planResult.rows[0].id;

    const username = process.env.E2E_USERNAME || 'e2etest';
    const email = process.env.E2E_EMAIL || 'e2etest@uknow.test';
    const password = process.env.E2E_PASSWORD || 'Test@1234';
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, is_verified, verified_at, active_plan_id, subscription_expires_at)
       VALUES ($1, $2, $3, $4, 'active', 'user', TRUE, NOW(), $5, NOW() + INTERVAL '1 year')`,
      [username, email, passwordHash, 'E2E Test User', planId]
    );

    console.log(`[e2e-seed] ✅ Hoàn tất:`);
    console.log(`           - DB: ${dbName}`);
    console.log(`           - User: ${username} / ${password}`);
    console.log(`           - Plan: E2E Test Plan (id=${planId})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[e2e-seed] ❌ Lỗi:', err.message);
  process.exit(1);
});
