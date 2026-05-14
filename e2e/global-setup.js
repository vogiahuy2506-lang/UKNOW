/**
 * Chạy seed DB trước khi test (cần e2e/.env.test).
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
      '[e2e-setup] Thiếu e2e/.env.test — chạy: cp e2e/.env.test.example e2e/.env.test'
    );
  }
  console.log('[e2e-setup] Reset + seed test DB...');
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'scripts', 'seed-test-db.js')],
    { stdio: 'inherit', cwd: __dirname }
  );
  if (result.status !== 0) {
    throw new Error(`[e2e-setup] seed exit ${result.status}`);
  }
}
