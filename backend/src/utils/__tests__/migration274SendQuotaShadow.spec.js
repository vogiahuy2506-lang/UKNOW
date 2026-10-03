/**
 * GHIM migration 274 (dấu vết bền shadow hạn mức gửi): 4 chỗ — migration, bootstrap, inventory, TRUNCATE.
 * Đọc thẳng file nên lệch là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/274_send_quota_shadow_daily_va_mismatches.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const DAILY_COLS = [
  'atomic_candidate_error', 'both_allowed', 'both_denied', 'channel', 'legacy_allow_atomic_deny',
  'legacy_deny_atomic_allow', 'total', 'updated_at', 'vn_day',
];
const MISMATCH_COLS = [
  'atomic_allowed', 'atomic_billing_user_id', 'atomic_diag', 'atomic_error', 'channel', 'created_at',
  'ctx_billing_user_id', 'id', 'legacy_allowed', 'legacy_detail', 'source_type', 'user_id', 'vn_day',
];

function tableBody(sql, table) {
  const m = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  expect(m).not.toBeNull();
  return m[1];
}
function columnsOf(body) {
  return body.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('PRIMARY KEY') && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0])
    .sort();
}

describe('migration 274', () => {
  it('có 2 CREATE TABLE IF NOT EXISTS đúng tên, PK (vn_day, channel) cho bảng daily', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS send_quota_shadow_daily/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS send_quota_shadow_mismatches/);
    expect(tableBody(migration, 'send_quota_shadow_daily')).toMatch(/PRIMARY KEY \(vn_day, channel\)/);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_sqsm_created_at ON send_quota_shadow_mismatches \(created_at\)/);
  });

  it('không khoá ngoại tới users', () => {
    expect(migration).not.toMatch(/REFERENCES/i);
  });

  it('cột trong migration khớp danh sách mong đợi', () => {
    expect(columnsOf(tableBody(migration, 'send_quota_shadow_daily'))).toEqual(DAILY_COLS);
    expect(columnsOf(tableBody(migration, 'send_quota_shadow_mismatches'))).toEqual(MISMATCH_COLS);
  });

  it('bootstrap phản chiếu đúng 2 bảng cùng cột', () => {
    expect(columnsOf(tableBody(bootstrap, 'send_quota_shadow_daily'))).toEqual(DAILY_COLS);
    expect(columnsOf(tableBody(bootstrap, 'send_quota_shadow_mismatches'))).toEqual(MISMATCH_COLS);
    expect(bootstrap).toMatch(/idx_sqsm_created_at/);
  });

  it('inventory có 2 bảng, danh sách cột khớp (so mảng) và _meta khớp tổng thật', () => {
    expect(inventory.tables.send_quota_shadow_daily).toEqual(DAILY_COLS);
    expect(inventory.tables.send_quota_shadow_mismatches).toEqual(MISMATCH_COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 274');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chứa 2 bảng', () => {
    expect(dbHelper).toMatch(/send_quota_shadow_daily,/);
    expect(dbHelper).toMatch(/send_quota_shadow_mismatches,/);
  });
});
