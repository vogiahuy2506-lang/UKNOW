/**
 * GHIM migration 276 (mốc "AI không trả lời được": email báo chủ + câu xin lỗi cho khách): 4 chỗ — migration, bootstrap,
 * inventory, TRUNCATE. Đọc thẳng file nên lệch là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/276_ai_unavailable_notices.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const COLS = ['id_user', 'kind', 'last_sent_at', 'notice_key', 'send_count'];

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

describe('migration 276', () => {
  it('CREATE TABLE IF NOT EXISTS đúng tên, khoá chính (id_user, kind, notice_key), kind bị CHECK, xoá chủ thì mốc đi theo', () => {
    const body = tableBody(migration, 'ai_unavailable_notices');
    expect(body).toMatch(/PRIMARY KEY \(id_user, kind, notice_key\)/);
    expect(body).toMatch(/CHECK \(kind IN \('owner_email', 'visitor_apology'\)\)/);
    expect(body).toMatch(/id_user\s+BIGINT\s+NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_ai_unavailable_notices_sent ON ai_unavailable_notices \(last_sent_at\)/);
  });

  it('chỉ CREATE — không DROP/ALTER', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b/i);
  });

  it('cột trong migration khớp danh sách mong đợi', () => {
    expect(columnsOf(tableBody(migration, 'ai_unavailable_notices'))).toEqual(COLS);
  });

  it('bootstrap phản chiếu đúng bảng cùng cột + ràng buộc', () => {
    const body = tableBody(bootstrap, 'ai_unavailable_notices');
    expect(columnsOf(body)).toEqual(COLS);
    expect(body).toMatch(/PRIMARY KEY \(id_user, kind, notice_key\)/);
    expect(body).toMatch(/CHECK \(kind IN \('owner_email', 'visitor_apology'\)\)/);
    expect(bootstrap).toMatch(/idx_ai_unavailable_notices_sent/);
  });

  it('inventory có bảng, danh sách cột khớp (so mảng) và _meta khớp tổng thật', () => {
    expect(inventory.tables.ai_unavailable_notices).toEqual(COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 276');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chứa bảng', () => {
    expect(dbHelper).toMatch(/ai_unavailable_notices,/);
  });
});
