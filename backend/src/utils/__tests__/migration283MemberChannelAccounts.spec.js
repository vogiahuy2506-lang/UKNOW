/**
 * GHIM migration 283 (member_channel_accounts — giao tài khoản Zalo cho nhân viên): 4 chỗ — migration, bootstrap,
 * inventory, TRUNCATE. Đọc thẳng file nên lệch là đỏ, không cần CSDL. Phép chạy thật (legacy + idempotent) ở
 * tests/integration/zaloAccountAssignment.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/283_member_channel_accounts.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const dbHelper = read('tests/integration/helpers/db.js');

const COLS = ['account_ref', 'channel', 'created_at', 'created_by', 'employee_id', 'id', 'owner_id', 'source'];

function bodyOf(sql, re) {
  const m = sql.match(re);
  expect(m).not.toBeNull();
  return m[1];
}
function columnsOf(body) {
  return body.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(CONSTRAINT|PRIMARY KEY|--)/.test(l) && !/^CHECK/.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((name) => /^[a-z_]+$/.test(name) && name !== 'chk_member_channel_accounts_source')
    .sort();
}

describe('migration 283', () => {
  const migrationTable = bodyOf(migration, /CREATE TABLE member_channel_accounts \(([\s\S]*?)\n\s*\);/);
  const bootstrapTable = bodyOf(bootstrap, /CREATE TABLE IF NOT EXISTS member_channel_accounts \(([\s\S]*?)\n\);/);

  it('bảng có UNIQUE (owner_id, employee_id, channel, account_ref), source bị CHECK, xoá chủ/nhân viên thì việc giao đi theo', () => {
    expect(migrationTable).toMatch(/CONSTRAINT uq_member_channel_accounts UNIQUE \(owner_id, employee_id, channel, account_ref\)/);
    expect(migrationTable).toMatch(/CHECK \(source IN \('assigned', 'self_login', 'legacy'\)\)/);
    expect(migrationTable).toMatch(/owner_id\s+BIGINT\s+NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(migrationTable).toMatch(/employee_id\s+BIGINT\s+NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(migrationTable).toMatch(/account_ref\s+TEXT\s+NOT NULL/);
    expect(migrationTable).toMatch(/created_by\s+BIGINT\s+REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it('chỉ tạo mới — không DROP / ALTER / SET NOT NULL', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|SET NOT NULL/i);
  });

  it('backfill legacy bọc trong "chỉ khi bảng vừa được tạo" (chạy lại không cấp lại sau khi chủ đã gỡ bớt)', () => {
    expect(migration).toMatch(/to_regclass\('public\.member_channel_accounts'\) IS NOT NULL INTO table_existed/);
    expect(migration).toMatch(/IF NOT table_existed THEN[\s\S]*CREATE TABLE member_channel_accounts[\s\S]*INSERT INTO member_channel_accounts[\s\S]*END IF;/);
  });

  it('legacy: nhân viên đang hoạt động đã chấp nhận, có ÍT NHẤT MỘT trong các quyền chạm tài khoản Zalo, x mọi tài khoản Zalo của chủ', () => {
    const insert = bodyOf(migration, /(INSERT INTO member_channel_accounts[\s\S]*?ON CONFLICT[^;]*;)/);
    expect(insert).toMatch(/'zalo_personal', zs\.id::text, 'legacy'/);
    expect(insert).toMatch(/JOIN zalo_settings zs ON zs\.id_user = um\.owner_id/);
    expect(insert).toMatch(/um\.status = 'active'/);
    expect(insert).toMatch(/um\.accepted_at IS NOT NULL/);
    for (const key of ['zalo_settings', 'inbox_view', 'inbox_reply', 'inbox_manage', 'campaigns_create', 'campaigns_run', 'ai_assistant_use', 'chatbot_channels_manage']) {
      expect(insert).toContain(`um.permissions @> '{"${key}": true}'::jsonb`);
    }
    expect(insert).toMatch(/ON CONFLICT \(owner_id, employee_id, channel, account_ref\) DO NOTHING/);
  });

  it('cột trong migration và bootstrap khớp danh sách mong đợi', () => {
    expect(columnsOf(migrationTable)).toEqual(COLS);
    expect(columnsOf(bootstrapTable)).toEqual(COLS);
  });

  it('bootstrap phản chiếu ràng buộc + hai index', () => {
    expect(bootstrapTable).toMatch(/CONSTRAINT uq_member_channel_accounts UNIQUE \(owner_id, employee_id, channel, account_ref\)/);
    expect(bootstrapTable).toMatch(/CHECK \(source IN \('assigned', 'self_login', 'legacy'\)\)/);
    expect(bootstrap).toMatch(/idx_member_channel_accounts_employee ON member_channel_accounts \(owner_id, employee_id, channel\)/);
    expect(bootstrap).toMatch(/idx_member_channel_accounts_ref ON member_channel_accounts \(channel, account_ref\)/);
  });

  it('inventory có bảng, danh sách cột khớp (so mảng) và _meta khớp tổng thật', () => {
    expect(inventory.tables.member_channel_accounts).toEqual(COLS);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 283 (bang moi member_channel_accounts');
  });

  it('TRUNCATE_ALL_SQL trong helpers/db.js chứa bảng', () => {
    expect(dbHelper).toMatch(/member_channel_accounts,/);
  });
});
