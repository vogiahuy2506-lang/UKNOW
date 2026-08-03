#!/usr/bin/env node
/**
 * S-5 — Kiểm tra schema cốt lõi trên DB bất kỳ (local / staging / production).
 *
 * Read-only. Exit 0 nếu OK (warnings không fail), exit 1 nếu thiếu cột/CHECK.
 *
 * Usage:
 *   cd backend && npm run check:schema
 *   DB_HOST=... DB_PORT=5432 DB_NAME=uknow-campaign DB_USER=... DB_PASSWORD=... npm run check:schema
 *
 * Cron VPS (ví dụ mỗi ngày 03:00):
 *   0 3 * * * cd /path/to/backend && npm run check:schema >> /var/log/uknow-schema-check.log 2>&1
 *
 * @see PLAN_SCHEMA_DRIFT.md S-5
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { checkCoreSchema } from '../src/utils/coreSchemaCheck.util.js';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const name = process.env.DB_NAME || '(unset)';
const user = process.env.DB_USER || '(unset)';

console.log(`[check:schema] Connecting ${user}@${host}:${port}/${name}`);

let exitCode = 0;
try {
  const result = await checkCoreSchema(db);

  if (result.warnings.length) {
    console.warn('[check:schema] Warnings:');
    for (const w of result.warnings) console.warn(`  - ${w}`);
  }

  if (result.ok) {
    console.log('[check:schema] OK — core schema matches expected (092/093 facts)');
  } else {
    console.error('[check:schema] FAILED:');
    for (const f of result.failures) console.error(`  - ${f}`);
    exitCode = 1;
  }
} catch (err) {
  console.error('[check:schema] Error:', err.message);
  exitCode = 1;
} finally {
  try {
    await db.pool.end();
  } catch {
    // ignore
  }
}

process.exit(exitCode);
