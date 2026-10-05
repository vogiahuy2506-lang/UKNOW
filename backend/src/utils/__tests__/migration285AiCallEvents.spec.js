/**
 * GHIM migration 285 (ai_call_events — sổ bền các lần gọi AI, PLAN_SUA_AI_DOT4_PR10): 4 chỗ — migration, bootstrap, inventory, TRUNCATE.
 * Đọc thẳng file nên lệch là đỏ, không cần CSDL. Phép ghi/đọc thật ở tests/integration/aiCallEvents.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/285_ai_call_events.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const COLS = [
  'actor_user_id', 'created_at', 'duration_ms', 'error_code', 'feature', 'http_status', 'id', 'layer', 'meta', 'model', 'outcome',
  'owner_user_id',
];

function bodyOf(sql, re) {
  const m = sql.match(re);
  expect(m).not.toBeNull();
  return m[1];
}
function columnsOf(body) {
  return body.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(CONSTRAINT|PRIMARY KEY|--)/.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((name) => /^[a-z_]+$/.test(name))
    .sort();
}

describe('migration 285', () => {
  const migrationTable = bodyOf(migration, /CREATE TABLE IF NOT EXISTS ai_call_events \(([\s\S]*?)\n\);/);
  const bootstrapTable = bodyOf(bootstrap, /CREATE TABLE IF NOT EXISTS ai_call_events \(([\s\S]*?)\n\);/);

  it('cột bắt buộc NOT NULL, KHÔNG có khoá ngoại tới users (sổ quan sát không được chặn việc xoá người dùng)', () => {
    expect(migrationTable).toMatch(/feature\s+VARCHAR\(60\)\s+NOT NULL/);
    expect(migrationTable).toMatch(/outcome\s+VARCHAR\(20\)\s+NOT NULL/);
    expect(migrationTable).toMatch(/layer\s+VARCHAR\(10\)\s+NOT NULL DEFAULT 'gemini'/);
    expect(migrationTable).toMatch(/meta\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(migrationTable).toMatch(/owner_user_id\s+BIGINT\s+NULL/);
    expect(migrationTable).toMatch(/actor_user_id\s+BIGINT\s+NULL/);
    expect(migrationTable).not.toMatch(/REFERENCES/);
  });

  it('chỉ tạo mới — không DROP / ALTER / SET NOT NULL / CONCURRENTLY, không tự BEGIN/COMMIT', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  it('hai index: (created_at) và (feature, created_at)', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toMatch(/idx_ai_call_events_created ON ai_call_events \(created_at\)/);
      expect(sql).toMatch(/idx_ai_call_events_feature_created ON ai_call_events \(feature, created_at\)/);
    }
  });

  it('cột trong migration và bootstrap khớp danh sách mong đợi', () => {
    expect(columnsOf(migrationTable)).toEqual(COLS);
    expect(columnsOf(bootstrapTable)).toEqual(COLS);
  });

  it('inventory có bảng, danh sách cột khớp (so mảng) và _meta khớp tổng thật', () => {
    expect(inventory.tables.ai_call_events).toEqual(COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 285 (bang moi ai_call_events');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chứa bảng', () => {
    expect(dbHelper).toMatch(/ai_call_events,/);
  });
});
