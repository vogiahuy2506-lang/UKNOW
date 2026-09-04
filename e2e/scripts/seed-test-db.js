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

/**
 * Đánh dấu MỌI migration là đã chạy, ngay sau khi dựng schema từ bootstrap.sql.
 *
 * VÌ SAO: bộ chạy migration (src/utils/migrationRunner.util.js) cố định baseline
 * 001–009 rồi replay 010 trở đi. Đúng cho DB production đã đi qua đủ lịch sử,
 * nhưng SAI cho DB test — bootstrap.sql là ảnh chụp schema ở trạng thái muộn,
 * replay lại migration cũ trên đó là replay ngược lịch sử.
 *
 * Cụ thể đã vỡ ở 013_unified_role: nó đổi role sang bộ tên trung gian
 * ('super_admin','user_admin'), rồi 014 đổi lại về ('user','admin'). Seed tạo
 * user với tên CUỐI nên 013 báo vi phạm ràng buộc và chặn toàn bộ phần sau.
 *
 * Trước đây không ai thấy vì migration chết sớm hơn ở 010 (thiếu pgvector).
 *
 * GIỚI HẠN: schema test = đúng những gì bootstrap.sql có. Hiện bootstrap.sql
 * thiếu 23 bảng mà migration tạo ra (channel_conversations, chatbot_messages,
 * notifications, custom_domains…), nên các màn hình phụ thuộc chúng chưa dùng
 * được ở máy. Muốn có thì phải bổ sung DDL vào bootstrap.sql.
 */
async function baselineAllMigrations(client) {
  const dir = path.resolve(__dirname, '..', '..', 'backend', 'migrations');
  if (!fs.existsSync(dir)) {
    console.warn('[e2e-seed] Không thấy thư mục migrations — bỏ qua baseline.');
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename  VARCHAR(255) PRIMARY KEY,
      ran_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  for (const file of files) {
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [file],
    );
  }
  console.log(`[e2e-seed] Baseline ${files.length} migration (schema đã do bootstrap.sql dựng).`);
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

    await baselineAllMigrations(client);

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

    // SĐT là BẮT BUỘC, không phải tuỳ chọn. `MainLayout.jsx` mở PhoneRequiredModal khi
    // `!user.phone && role !== 'admin'`, và modal đó KHÔNG đóng được — overlay của nó phủ
    // kín trang nên mọi `click()` của Playwright bị chặn với
    //   "<div class=\"modal-overlay\">…</div> intercepts pointer events".
    // Bỏ cột này thì auth.spec.js và campaigns.spec.js đỏ mà thông báo lỗi không hề nhắc
    // tới SĐT — rất tốn thời gian để lần ra.
    // Đây là lần thứ ba cùng một khuôn lỗi kể từ khi có tính năng SĐT bắt buộc: production
    // (backend cũ không trả `phone`), helper `createUser` của integration test, và seed này.
    // Thêm đường tạo user mới ở đâu thì phải cấp SĐT ở đó.
    const phone = process.env.E2E_PHONE || '0900000001';

    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, status, role, is_verified, verified_at, active_plan_id, subscription_expires_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'user', TRUE, NOW(), $6, NOW() + INTERVAL '1 year')
       RETURNING id`,
      [username, email, passwordHash, 'E2E Test User', phone, planId]
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
