/**
 * Setup file cho integration test:
 *   1. Đảm bảo các env var test (JWT, DB) đã được thiết lập trước khi import app.
 *   2. Reset schema test DB (DROP + CREATE schema public).
 *   3. Chạy bootstrap.sql để dựng schema tối thiểu.
 *
 * File này được Jest gọi qua `globalSetup` (1 lần trước toàn bộ test suites).
 *
 * Lưu ý: KHÔNG được run trên DB production. Hàm refuse nếu DB_NAME không
 * chứa "_test". DB_*: tests/integration/.env.test nếu có; nếu không — trên
 * máy local (không CI) ép DB_* từ e2e/.env.test hoặc .env.test.example; nếu vẫn không
 * có — gán sẵn localhost:5433/postgres (khớp e2e/docker-compose). Trên CI chỉ merge
 * biến DB trống từ file e2e nếu có.
 */
// Không load backend/.env. DB_*: xem resolveIntegrationDbEnv() bên dưới.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_SQL_PATH = path.join(__dirname, 'sql', 'bootstrap.sql');

/**
 * Bảo vệ không chạy reset trên DB production.
 * @param {string} name
 */
function assertTestDatabaseName(name) {
  if (!name) {
    throw new Error(
      '[integration-setup] DB_NAME vẫn trống sau khi load .env.test / mặc định. ' +
        'Đặt DB_NAME (phải chứa _test) hoặc tạo tests/integration/.env.test từ .env.test.example.'
    );
  }
  if (!/_test(\b|$)/i.test(name)) {
    throw new Error(
      `[integration-setup] DB_NAME="${name}" không chứa "_test". ` +
        'Để tránh xóa nhầm DB production, integration test chỉ chạy trên DB có hậu tố "_test".'
    );
  }
}

/**
 * @param {unknown} err
 * @param {{ host: string, port: number, database: string, user: string }} ctx
 */
function formatConnectFailure(err, ctx) {
  const parts = [];
  const collect = (e) => {
    if (!e) return;
    if (typeof e === 'string') {
      parts.push(e);
      return;
    }
    if (e instanceof Error && e.message) parts.push(e.message);
    if (typeof e.code === 'string') parts.push(`code=${e.code}`);
  };
  collect(err);
  if (err && typeof err === 'object' && 'errors' in err && Array.isArray(err.errors)) {
    for (const sub of err.errors) collect(sub);
  }
  const detail = parts.filter(Boolean).join(' | ') || String(err);

  const lines = [
    '[integration-setup] Không kết nối được Postgres.',
    `  Thử kết nối: host=${ctx.host} port=${ctx.port} database=${ctx.database} user=${ctx.user}`,
    `  Chi tiết: ${detail}`,
    '',
    '  Việc cần kiểm tra:',
    '  1) Postgres đang chạy (Docker e2e: cd e2e && docker compose up -d postgres-e2e).',
    '  2) Database uknow_campaign_test tồn tại (Docker e2e đã tạo sẵn).',
    '  3) Sai mật khẩu (28P01): tạo backend/tests/integration/.env.test (copy .env.test.example) với đúng DB_PASSWORD, hoặc dùng Docker e2e (port 5433, mật khẩu postgres) khi không có file đó.',
  ];
  return lines.join('\n');
}

/**
 * Đọc DB_HOST|PORT|NAME|USER|PASSWORD từ file .env.
 * @param {string} filePath
 * @param {{ overwrite: boolean }} opts overwrite=true → ghi đè process.env (local không có tests/integration/.env.test).
 */
function applyDbVarsFromEnvFile(filePath, { overwrite }) {
  if (!fs.existsSync(filePath)) return false;

  const keys = new Set(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);
  let applied = false;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!keys.has(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const cur = process.env[key];
    const shouldSet = overwrite || cur === undefined || cur === '';
    if (shouldSet) {
      process.env[key] = val;
      applied = true;
    }
  }
  return applied;
}

function isCiEnvironment() {
  return (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true'
  );
}

/**
 * Cấu hình DB cho integration: ưu tiên tests/integration/.env.test;
 * không có file đó thì dùng e2e (Docker) — local ép DB_* từ file e2e để tránh nhiễu từ shell.
 * Thử lần lượt .env.test rồi .env.test.example (file đầu có thể tồn tại nhưng trống DB_*).
 */
function resolveIntegrationDbEnv() {
  const integrationEnvPath = path.join(__dirname, '.env.test');
  const e2eDir = path.join(__dirname, '..', '..', 'e2e');
  const e2eEnvPath = path.join(e2eDir, '.env.test');
  const e2eExamplePath = path.join(e2eDir, '.env.test.example');

  if (fs.existsSync(integrationEnvPath)) {
    dotenv.config({ path: integrationEnvPath });
    return { source: 'tests/integration/.env.test' };
  }

  const overwriteFromE2e = !isCiEnvironment();
  const candidates = [e2eEnvPath, e2eExamplePath];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && applyDbVarsFromEnvFile(filePath, { overwrite: overwriteFromE2e })) {
      return {
        source: overwriteFromE2e
          ? `${path.basename(filePath)} (ép DB_* — tránh biến shell lẫn backend)`
          : `${path.basename(filePath)} (chỉ bổ sung DB_* trống — CI)`,
      };
    }
  }
  return { source: 'defaults' };
}

/** Khớp e2e/docker-compose.yml — dùng khi repo thiếu file env nhưng dev vẫn chạy container E2E. */
function applyBuiltinDockerE2eDbVars() {
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5433';
  process.env.DB_NAME = 'uknow_campaign_test';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = 'postgres';
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

  let dbResolved = resolveIntegrationDbEnv();
  if (dbResolved.source === 'defaults' && !isCiEnvironment()) {
    applyBuiltinDockerE2eDbVars();
    dbResolved = {
      source: 'built-in (localhost:5433, postgres — giống e2e/docker-compose; không cần file e2e/)',
    };
  }

  if (dbResolved.source !== 'tests/integration/.env.test') {
    // eslint-disable-next-line no-console
    console.warn(`[integration-setup] DB từ: ${dbResolved.source}`);
  }

  if (!process.env.DB_NAME) {
    process.env.DB_NAME = 'uknow_campaign_test';
    // eslint-disable-next-line no-console
    console.warn(
      '[integration-setup] DB_NAME chưa set — dùng mặc định uknow_campaign_test. ' +
        'Override: export DB_NAME=... hoặc tests/integration/.env.test (xem .env.test.example).'
    );
  }

  const dbName = process.env.DB_NAME;
  assertTestDatabaseName(dbName);

  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 5432;
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'password';

  const client = new pg.Client({
    host,
    port,
    database: dbName,
    user,
    password,
  });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(formatConnectFailure(err, { host, port, database: dbName, user }));
  }
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
