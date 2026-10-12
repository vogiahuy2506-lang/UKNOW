/**
 * GHIM migration 298 (orders.payment_reminder_sent_at + khoa mau thu order_payment_reminder, PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO PR-A):
 * 4 cho phai khop - migration, bootstrap, inventory, va whitelist khoa mau thu trong code. Doc thang file nen lech la do, khong can CSDL.
 * Hanh vi that cua truy van chon don (cua so 2-72 gio, khong pending/failed...) o tests/integration/abandonedCheckoutReminder.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../repositories/admin/systemEmailTemplate.repository.js', () => ({
  findSystemEmailTemplate: jest.fn(),
  saveSystemEmailTemplate: jest.fn(),
  deleteSystemEmailTemplate: jest.fn(),
}));
const { SYSTEM_EMAIL_TEMPLATE_KEYS } = await import('../../services/email/welcomeEmailTemplate.service.js');
const { lintMigrationSqlContent } = await import('../migrationSafety.util.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/298_orders_payment_reminder.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));

const sqlOnly = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const bootstrapBlock = bootstrap.split('-- --- Migration 298')[1].split('-- --- Migration')[0];

function checkKeys(sql) {
  const m = sql.match(/system_email_templates_key_check\s+CHECK \(template_key IN \(([^)]*)\)\)/);
  expect(m).not.toBeNull();
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe('migration 298', () => {
  it('them cot orders.payment_reminder_sent_at TIMESTAMPTZ, nullable, IF NOT EXISTS (migration + bootstrap)', () => {
    for (const sql of [sqlOnly(migration), bootstrapBlock]) {
      expect(sql).toMatch(/ALTER TABLE orders\s+ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;/);
    }
  });

  it('index tung phan CHI cho don cancelled chua nhac - KHONG gom failed (failed = webhook bao sai so tien, tien co the da vao)', () => {
    for (const sql of [sqlOnly(migration), bootstrapBlock]) {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_orders_payment_reminder_scan\s+ON orders \(created_at\)\s+WHERE payment_reminder_sent_at IS NULL AND status = 'cancelled';/
      );
      expect(sql).not.toMatch(/'failed'/);
    }
  });

  it('CHECK khoa mau thu: tap hop day du va khop SYSTEM_EMAIL_TEMPLATE_KEYS trong code (them khoa o code ma quen migration thi do)', () => {
    expect(checkKeys(migration)).toEqual(SYSTEM_EMAIL_TEMPLATE_KEYS);
    expect(checkKeys(bootstrapBlock)).toEqual(SYSTEM_EMAIL_TEMPLATE_KEYS);
    expect(SYSTEM_EMAIL_TEMPLATE_KEYS).toContain('order_payment_reminder');
  });

  it('DROP CONSTRAINT duy nhat co annotation allow-destructive-ddl; khong DROP/RENAME/SET NOT NULL/CONCURRENTLY khac, khong tu BEGIN/COMMIT', () => {
    expect(migration).toMatch(/^-- allow-destructive-ddl: /m);
    const sql = sqlOnly(migration);
    expect(sql.match(/\bDROP\b/gi)).toEqual(['DROP']);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS system_email_templates_key_check/);
    expect(sql).not.toMatch(/\bRENAME\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  // Bo kiem "Migration Safety" (scripts/checkMigrationSafety.js, chay o CI) CHI cong nhan annotation allow-destructive-ddl dung truoc cau lenh dau tien
  // cua file va chi mien dung cau DDL ngay sau no; annotation dat giua file (sau mot cau lenh khac) khong co hieu luc. Chay thang bo lint that o day
  // de loi dat sai cho bi unit bat truoc khi toi CI.
  it('qua bo kiem an toan migration THAT: annotation dung truoc cau lenh DDL dau tien va chi mien DROP CONSTRAINT do', () => {
    const result = lintMigrationSqlContent(migration, '298_orders_payment_reminder.sql');
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.hasAnnotation).toBe(true);
  });

  it('inventory: orders co cot moi (sap xep), _meta khop tong that va ghi chu migration 298', () => {
    const cols = inventory.tables.orders;
    expect(cols).toContain('payment_reminder_sent_at');
    expect([...cols].sort()).toEqual(cols);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 298 (orders.payment_reminder_sent_at');
  });
});
