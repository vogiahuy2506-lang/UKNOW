/**
 * GHIM migration 304 (tag khách hàng, PLAN_TAG_KHACH_HANG PR-T1): migration chỉ THÊM, không DDL nguy hiểm; bootstrap
 * (DB test) và ảnh chụp schema khớp migration. Đọc thẳng file nên lệch là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/304_customer_tags.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('migration 304 — customer_tags / customer_tag_assignments', () => {
  it('chỉ thêm: không DROP / RENAME / SET NOT NULL / ALTER TYPE / CONCURRENTLY, không tự BEGIN/COMMIT', () => {
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bRENAME\b|SET NOT NULL|ALTER COLUMN|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  it('tên tag duy nhất KHÔNG phân biệt hoa/thường theo workspace (unique index trên LOWER(name))', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain('uq_customer_tags_ws_lower_name');
      expect(sql).toMatch(/UNIQUE INDEX[^;]*ON customer_tags \(workspace_owner_id, \(LOWER\(name\)\)\)/);
    }
  });

  it('gán: PK (customer_id, tag_id), cascade theo khách và tag, nguồn chỉ manual|campaign, có index theo tag', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain('PRIMARY KEY (customer_id, tag_id)');
      expect(sql).toMatch(/customer_id BIGINT\s+NOT NULL REFERENCES customers\(id\) ON DELETE CASCADE/);
      expect(sql).toMatch(/tag_id\s+BIGINT\s+NOT NULL REFERENCES customer_tags\(id\) ON DELETE CASCADE/);
      expect(sql).toContain("CHECK (source IN ('manual', 'campaign'))");
      expect(sql).toContain('customer_tag_assignments (tag_id)');
    }
  });

  it('ảnh chụp schema có đủ hai bảng với đúng cột', () => {
    expect(inventory.tables.customer_tags).toEqual(['color', 'created_at', 'id', 'name', 'updated_at', 'workspace_owner_id']);
    expect(inventory.tables.customer_tag_assignments).toEqual([
      'assigned_at', 'assigned_by', 'campaign_id', 'customer_id', 'run_id', 'source', 'tag_id',
    ]);
  });
});
