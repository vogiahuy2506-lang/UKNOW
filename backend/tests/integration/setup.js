/**
 * Setup file cho integration test:
 *   1. Đảm bảo các env var test (JWT, DB) đã được thiết lập trước khi import app.
 *   2. Reset schema test DB (DROP + CREATE schema public).
 *   3. Chạy bootstrap.sql để dựng schema tối thiểu.
 *
 * File này được Jest gọi qua `globalSetup` (1 lần trước toàn bộ test suites).
 *
 * Lưu ý: KHÔNG được run trên DB production. Hàm sẽ refuse nếu DB_NAME không
 * chứa "_test" để chống nhầm lẫn (xem `assertTestDatabaseName`).
 */
// Cố ý KHÔNG import 'dotenv/config' ở đây:
//   - backend/.env chứa config production (Neon SSL, key thật).
//   - Test phải tự nhận env từ command line / CI để bảo đảm chạy đúng DB test.
//   - Nếu cần test với .env, dev tự `source` trước khi chạy `npm run test:integration`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_SQL_PATH = path.join(__dirname, 'sql', 'bootstrap.sql');

/**
 * Bảo vệ không chạy reset trên DB production.
 * @param {string} name
 */
function assertTestDatabaseName(name) {
  if (!name) {
    throw new Error(
      '[integration-setup] DB_NAME chưa được set. ' +
        'Hãy export DB_NAME=uknow_campaign_test trước khi chạy `npm run test:integration`.'
    );
  }
  if (!/_test(\b|$)/i.test(name)) {
    throw new Error(
      `[integration-setup] DB_NAME="${name}" không chứa "_test". ` +
        'Để tránh xóa nhầm DB production, integration test chỉ chạy trên DB có hậu tố "_test".'
    );
  }
}

export default async function globalSetup() {
  // Ép NODE_ENV để app.js skip morgan, helpers biết đang ở test mode.
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';

  // Cấp JWT secret mặc định để khỏi yêu cầu .env trong CI.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-only';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-for-integration-only';
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  // BullMQ phải tắt trong test để không cần Redis.
  process.env.BULLMQ_ENABLED = 'false';

  const dbName = process.env.DB_NAME;
  assertTestDatabaseName(dbName);

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: dbName,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });

  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    const sql = fs.readFileSync(BOOTSTRAP_SQL_PATH, 'utf8');
    await client.query(sql);
  } finally {
    await client.end();
  }

  // eslint-disable-next-line no-console
  console.log(`[integration-setup] Đã bootstrap schema test trên DB "${dbName}"`);
}
