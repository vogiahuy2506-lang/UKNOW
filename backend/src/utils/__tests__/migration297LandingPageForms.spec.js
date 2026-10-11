/**
 * GHIM migration 297 (landing_page_forms - chi muc landing <-> bieu mau nhieu-nhieu, PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-6):
 * 4 cho - migration, bootstrap, inventory, TRUNCATE. Doc thang file nen lech la do, khong can CSDL.
 * Phep ghi/doc that (backfill, ghi lai chi muc khi luu landing) o tests/integration/landingFormsMulti.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/297_landing_page_forms.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const COLS = ['created_at', 'form_id', 'kind', 'landing_page_id', 'position'];

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

describe('migration 297', () => {
  const migrationTable = bodyOf(migration, /CREATE TABLE IF NOT EXISTS landing_page_forms \(([\s\S]*?)\n\);/);
  const bootstrapTable = bodyOf(bootstrap, /CREATE TABLE IF NOT EXISTS landing_page_forms \(([\s\S]*?)\n\);/);

  it('khoa chinh (landing_page_id, form_id); hai khoa ngoai ON DELETE CASCADE; position NOT NULL; kind nullable', () => {
    for (const table of [migrationTable, bootstrapTable]) {
      expect(table).toMatch(/landing_page_id\s+BIGINT\s+NOT NULL REFERENCES landing_pages\(id\) ON DELETE CASCADE/);
      expect(table).toMatch(/form_id\s+BIGINT\s+NOT NULL REFERENCES forms\(id\) ON DELETE CASCADE/);
      expect(table).toMatch(/position\s+INT\s+NOT NULL/);
      expect(table).toMatch(/kind\s+VARCHAR\(20\),/);
      expect(table).toMatch(/PRIMARY KEY \(landing_page_id, form_id\)/);
    }
  });

  it('chi them bang + index + backfill - KHONG DROP / ALTER / SET NOT NULL / CONCURRENTLY, khong tu BEGIN/COMMIT', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  it('index theo form_id o ca migration lan bootstrap', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toMatch(/idx_landing_page_forms_form_id ON landing_page_forms \(form_id\)/);
    }
  });

  it('backfill tu forms.landing_page_id, position 0, idempotent (ON CONFLICT DO NOTHING)', () => {
    expect(migration).toMatch(/INSERT INTO landing_page_forms \(landing_page_id, form_id, position\)/);
    expect(migration).toMatch(/SELECT f\.landing_page_id, f\.id, 0\s+FROM forms f\s+WHERE f\.landing_page_id IS NOT NULL/);
    expect(migration).toMatch(/ON CONFLICT \(landing_page_id, form_id\) DO NOTHING/);
  });

  it('cot trong migration va bootstrap khop danh sach mong doi', () => {
    expect(columnsOf(migrationTable)).toEqual(COLS);
    expect(columnsOf(bootstrapTable)).toEqual(COLS);
  });

  it('inventory co bang, danh sach cot khop (so mang) va _meta khop tong that', () => {
    expect(inventory.tables.landing_page_forms).toEqual(COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 297 (bang moi landing_page_forms');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chua bang', () => {
    expect(dbHelper).toMatch(/landing_page_forms,/);
  });
});
