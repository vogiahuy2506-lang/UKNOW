/**
 * Reset schema + bootstrap + seed plan + user e2etest.
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

/** Có đổ dữ liệu mẫu (bộ gói giống production) hay không. */
function isDemoSeedEnabled() {
  const flags = [
    'E2E_SEED_DEMO',
    'E2E_SEED_ALL',
    'E2E_SEED_CHANNELS',
    'E2E_SEED_TEMPLATES',
    'E2E_SEED_CUSTOMERS',
    'E2E_SEED_CAMPAIGNS',
    'E2E_SEED_CHATBOT',
    'E2E_SEED_INBOX',
    'E2E_SEED_LANDING',
    'E2E_SEED_ORDERS',
    'E2E_SEED_EMPLOYEES',
    'E2E_SEED_PENDING_CHANGE',
    'E2E_SEED_OVERAGE',
  ];
  return flags.some((flag) => ['1', 'true', 'yes'].includes(String(process.env[flag] || '').toLowerCase()));
}

function assertTestDbName(name) {
  if (!name) {
    throw new Error('[e2e-seed] Thiếu DB_NAME trong e2e/.env.test');
  }
  if (!/_test(\b|$)/i.test(name)) {
    throw new Error(`[e2e-seed] DB_NAME="${name}" phải kết thúc bằng "_test"`);
  }
}

async function ensureTestDbExists(connInfo, dbName) {
  const admin = new pg.Client({ ...connInfo, database: 'postgres' });
  try {
    await admin.connect();
  } catch (err) {
    const msg = err?.message != null ? String(err.message) : String(err);
    console.warn(`[e2e-seed] Không kết nối DB "postgres" (${msg}) — giả định DB đã tồn tại.`);
    return;
  }
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      console.log(`[e2e-seed] CREATE DATABASE "${dbName}"`);
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } catch (err) {
    console.warn(`[e2e-seed] Bỏ qua CREATE DATABASE: ${err.message}`);
  } finally {
    await admin.end();
  }
}

async function main() {
  const dbName = process.env.DB_NAME;
  assertTestDbName(dbName);

  if (!fs.existsSync(BOOTSTRAP_SQL)) {
    throw new Error(`[e2e-seed] Không thấy ${BOOTSTRAP_SQL}`);
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
    console.log(`[e2e-seed] Reset schema ${dbName}...`);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query(bootstrapSql);

    const planResult = await client.query(
      `INSERT INTO plans (code, name, price, description, is_active, max_employees, daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit)
       VALUES ('e2e_test_plan', 'E2E Test Plan', 0, 'E2E', TRUE, 5, 1000, 30000, 500, 15000)
       RETURNING id`
    );
    const planId = planResult.rows[0].id;

    const username = process.env.E2E_USERNAME || 'e2etest';
    const email = process.env.E2E_EMAIL || 'e2etest@uknow.test';
    const password = process.env.E2E_PASSWORD || 'Test@1234';
    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, is_verified, verified_at, active_plan_id, subscription_expires_at)
       VALUES ($1, $2, $3, $4, 'active', 'user', TRUE, NOW(), $5, NOW() + INTERVAL '1 year')
       RETURNING id`,
      [username, email, passwordHash, 'E2E Test User', planId]
    );

    // Dữ liệu mẫu để chụp ảnh minh hoạ — CHỈ khi được yêu cầu. Bộ test e2e dựa
    // vào trạng thái rỗng, bật mặc định sẽ làm đỏ hàng loạt test không liên quan.
    if (isDemoSeedEnabled()) {
      const { seedDemoData } = await import('./seed-demo-data.js');
      await seedDemoData(client, { userId: userResult.rows[0].id });
    }

    console.log(`[e2e-seed] OK — user ${username} / plan id=${planId}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[e2e-seed]', err.message);
  process.exit(1);
});
