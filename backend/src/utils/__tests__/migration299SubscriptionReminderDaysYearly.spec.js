/**
 * GHIM migration 299 (subscription_reminder_settings.days_before_yearly, PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12 B1):
 * 3 cho - migration, bootstrap, inventory. Doc thang file nen lech la do, khong can CSDL.
 * Phep ghi/doc that (GET mac dinh, PUT giu gia tri cu) o tests/integration/adminSubscriptionReminderSettings.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/299_subscription_reminder_days_yearly.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));

describe('migration 299', () => {
  it('chi ADD COLUMN IF NOT EXISTS (INTEGER[] NOT NULL DEFAULT {30,7,3}) - KHONG DROP / RENAME / SET NOT NULL / CONCURRENTLY, khong tu BEGIN/COMMIT', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).toMatch(
      /ALTER TABLE subscription_reminder_settings\s+ADD COLUMN IF NOT EXISTS days_before_yearly INTEGER\[\] NOT NULL DEFAULT '\{30,7,3\}'/
    );
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bRENAME\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
  });

  it('cot cu days_before giu nguyen ten + mac dinh {7,3} trong bootstrap; cot moi mirror dung kieu va mac dinh', () => {
    const table = bootstrap.match(/CREATE TABLE IF NOT EXISTS subscription_reminder_settings \(([\s\S]*?)\n\);/);
    expect(table).not.toBeNull();
    expect(table[1]).toMatch(/days_before\s+INTEGER\[\]\s+NOT NULL DEFAULT '\{7,3\}'/);
    expect(table[1]).toMatch(/days_before_yearly INTEGER\[\] NOT NULL DEFAULT '\{30,7,3\}'/);
  });

  it('inventory co cot moi (sap xep), _meta khop tong that va note nhac toi migration 299', () => {
    expect(inventory.tables.subscription_reminder_settings).toEqual([
      'days_before', 'days_before_yearly', 'id', 'updated_at', 'updated_by',
    ]);
    const tables = Object.keys(inventory.tables).length;
    const columns = Object.values(inventory.tables).reduce((n, v) => n + v.length, 0);
    expect(inventory._meta.tables).toBe(tables);
    expect(inventory._meta.columns).toBe(columns);
    expect(inventory._meta.note).toContain('migration 299 (subscription_reminder_settings.days_before_yearly');
  });
});
