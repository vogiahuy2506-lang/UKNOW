/**
 * Global setup chạy 1 lần trước toàn bộ E2E test:
 *   - Reset & seed test DB qua seed-test-db.js
 *
 * Playwright `webServer` chỉ tự khởi động frontend (Vite). Backend phải
 * chạy sẵn ở Terminal khác (`npm run dev:e2e` trong `backend/`).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_TEST = path.join(__dirname, '.env.test');

export default async function globalSetup() {
  if (!fs.existsSync(ENV_TEST)) {
    throw new Error(
      '[e2e-setup] Thiếu file e2e/.env.test. Sao chép mẫu: cp e2e/.env.test.example e2e/.env.test rồi chỉnh DB_* nếu cần.'
    );
  }

  console.log('[e2e-setup] Reset + seed test DB...');
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'scripts', 'seed-test-db.js')],
    { stdio: 'inherit', cwd: __dirname }
  );
  if (result.status !== 0) {
    throw new Error(`[e2e-setup] seed-test-db.js exit code ${result.status}`);
  }
}
