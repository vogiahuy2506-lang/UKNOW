#!/usr/bin/env node
/**
 * Schema drift check — read-only (PR3 bước 1 / S-5).
 *
 * So sánh DB hiện tại với kỳ vọng từ bootstrap (kiểu, NOT NULL, CHECK, FK, UNIQUE)
 * + probe dữ liệu: order_code không ép BIGINT được, orphan active_plan_id, payment_method NULL.
 *
 * Usage:
 *   cd backend && npm run check:schema
 *   cd backend && npm run check:schema -- --report   # in bảng lệch, luôn exit 0
 *   DB_HOST=... DB_NAME=uknow-campaign npm run check:schema
 *
 * VPS:
 *   docker exec -i uknow-campaign-backend npm run check:schema
 *   docker exec -i uknow-campaign-backend npm run check:schema -- --report
 *
 * @see PLAN_THANH_TOAN_TRUOC_MO_BAN.md Việc 3a
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { checkCoreSchema } from '../src/utils/coreSchemaCheck.util.js';

const reportOnly =
  process.argv.includes('--report') ||
  process.env.SCHEMA_CHECK_REPORT_ONLY === '1' ||
  process.env.SCHEMA_CHECK_REPORT_ONLY === 'true';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const name = process.env.DB_NAME || '(unset)';
const user = process.env.DB_USER || '(unset)';

console.log(`[check:schema] Connecting ${user}@${host}:${port}/${name}`);
if (reportOnly) {
  console.log('[check:schema] Mode: --report (exit 0 kể cả khi có lệch — chỉ in kết quả)');
}

function pad(s, n) {
  const t = String(s ?? '');
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

function printDriftTable(drifts) {
  if (!drifts.length) {
    console.log('[check:schema] Drift table: (empty)');
    return;
  }
  console.log('\n[check:schema] === BẢNG LỆCH (DB vs bootstrap kỳ vọng) ===');
  console.log(
    `${pad('kind', 22)} ${pad('table', 12)} ${pad('column', 22)} ${pad('expected', 28)} ${pad('actual', 28)}`
  );
  console.log('-'.repeat(114));
  for (const d of drifts) {
    console.log(
      `${pad(d.kind, 22)} ${pad(d.table, 12)} ${pad(d.column, 22)} ${pad(d.expected, 28)} ${pad(d.actual, 28)}`
    );
  }
  console.log('');
}

let exitCode = 0;
try {
  const result = await checkCoreSchema(db);

  printDriftTable(result.drifts || []);

  if (result.warnings.length) {
    console.warn('[check:schema] Warnings / data probes:');
    for (const w of result.warnings) console.warn(`  - ${w}`);
  }

  if (result.ok) {
    console.log('[check:schema] OK — schema khớp kỳ vọng (bootstrap + 092/093 facts)');
  } else {
    console.error('[check:schema] FAILED — lệch schema:');
    for (const f of result.failures) console.error(`  - ${f}`);
    if (!reportOnly) {
      exitCode = 1;
    } else {
      console.log(
        '[check:schema] --report: không fail process. Chép bảng lệch để quyết phạm vi migration (bước 2).'
      );
    }
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
