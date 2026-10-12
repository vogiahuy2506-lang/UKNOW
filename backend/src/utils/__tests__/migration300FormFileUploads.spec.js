/**
 * GHIM migration 300 (form_file_uploads - phien tai tep tam cua truong `file`, PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-4b):
 * migration, bootstrap, inventory, TRUNCATE va dong seed su kien chuong. Doc thang file nen lech la do, khong can CSDL.
 * Phep ghi/doc that (xin URL, nop bai, don dep) o tests/integration/formsFileUpload.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/300_form_file_uploads.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const COLS = [
  'content_type', 'created_at', 'declared_size', 'expires_at', 'field_key', 'file_ext', 'file_name', 'form_id', 'id',
  'max_bytes', 'object_key', 'status', 'submission_id', 'used_at', 'workspace_owner_id',
];

function bodyOf(sql, re) {
  const m = sql.match(re);
  expect(m).not.toBeNull();
  return m[1];
}
function columnsOf(body) {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(CONSTRAINT|PRIMARY KEY|--)/.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((name) => /^[a-z_]+$/.test(name))
    .sort();
}

describe('migration 300', () => {
  const migrationTable = bodyOf(migration, /CREATE TABLE IF NOT EXISTS form_file_uploads \(([\s\S]*?)\n\);/);
  const bootstrapTable = bodyOf(bootstrap, /CREATE TABLE IF NOT EXISTS form_file_uploads \(([\s\S]*?)\n\);/);

  it('khoa chinh uuid, hai khoa ngoai ON DELETE CASCADE, object_key UNIQUE, status chi pending|used', () => {
    for (const table of [migrationTable, bootstrapTable]) {
      expect(table).toMatch(/id\s+UUID\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
      expect(table).toMatch(/form_id\s+BIGINT\s+NOT NULL REFERENCES forms\(id\) ON DELETE CASCADE/);
      expect(table).toMatch(/workspace_owner_id\s+BIGINT\s+NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
      expect(table).toMatch(/object_key\s+TEXT\s+NOT NULL UNIQUE/);
      expect(table).toMatch(/status\s+VARCHAR\(10\)\s+NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'used'\)\)/);
      expect(table).toMatch(/declared_size\s+BIGINT\s+NOT NULL CHECK \(declared_size > 0\)/);
      expect(table).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT NULL/);
    }
  });

  it('chi them bang + index + seed - KHONG DROP / ALTER / SET NOT NULL / CONCURRENTLY, khong tu BEGIN/COMMIT', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  it('4 index (het han pending, used_at, theo form, pending theo chu) o ca migration lan bootstrap', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toMatch(/idx_form_file_uploads_pending_expiry\s+ON form_file_uploads \(expires_at\) WHERE status = 'pending'/);
      expect(sql).toMatch(/idx_form_file_uploads_used_at\s+ON form_file_uploads \(used_at\) WHERE status = 'used'/);
      expect(sql).toMatch(/idx_form_file_uploads_form\s+ON form_file_uploads \(form_id\)/);
      expect(sql).toMatch(/idx_form_file_uploads_owner_pending\s+ON form_file_uploads \(workspace_owner_id\) WHERE status = 'pending'/);
    }
  });

  it('seed su kien chuong form_file_quota_exceeded: chi chuong, user tat duoc email, ON CONFLICT DO NOTHING (khong ghi de dong admin da chinh)', () => {
    for (const sql of [migration, bootstrap.split('-- --- Migration 300')[1]]) {
      expect(sql).toMatch(/\('form_file_quota_exceeded', true, false, true\)/);
      expect(sql).toMatch(/ON CONFLICT \(event_type\) DO NOTHING/);
    }
  });

  it('cot trong migration va bootstrap khop danh sach mong doi', () => {
    expect(columnsOf(migrationTable)).toEqual(COLS);
    expect(columnsOf(bootstrapTable)).toEqual(COLS);
  });

  it('inventory co bang, danh sach cot khop va _meta khop tong that', () => {
    expect(inventory.tables.form_file_uploads).toEqual(COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 300 (bang moi form_file_uploads');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chua bang', () => {
    expect(dbHelper).toMatch(/form_file_uploads,/);
  });
});
