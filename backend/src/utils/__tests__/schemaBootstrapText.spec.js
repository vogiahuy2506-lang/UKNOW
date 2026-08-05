/**
 * Fast guards on bootstrap.sql text (PLAN_SCHEMA_DRIFT S-2).
 * Removing 'voucher' from the payment_method CHECK must fail this suite —
 * that was the exact drift that let integration tests stay green while
 * 100%-discount checkout returned 500 in real DB.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_SQL_PATH = path.resolve(
  __dirname,
  '../../../tests/integration/sql/bootstrap.sql'
);

const REQUIRED_USER_MAX_COLUMNS = [
  'max_employees',
  'max_campaigns',
  'max_zalo_accounts',
  'max_email_accounts',
  'max_email_templates',
  'max_zalo_templates',
  'max_landing_pages',
];

/**
 * Isolate one CREATE TABLE body. Every assertion below must be scoped this way:
 * `plans` declares max_* columns with the same names as `users`, and a later table
 * also has a payment_method column, so a whole-file search silently passes even
 * when the column is missing from the table under test.
 */
function tableBody(sql, table) {
  const match = sql.match(new RegExp(`CREATE TABLE ${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (!match) throw new Error(`Không tìm thấy CREATE TABLE ${table} trong bootstrap.sql`);
  return match[1];
}

describe('bootstrap.sql text parity (S-2)', () => {
  const bootstrapSql = fs.readFileSync(BOOTSTRAP_SQL_PATH, 'utf8');
  const ordersBody = tableBody(bootstrapSql, 'orders');
  const usersBody = tableBody(bootstrapSql, 'users');

  it("orders payment_method CHECK includes 'voucher'", () => {
    expect(ordersBody).toMatch(
      /CHECK\s*\(\s*payment_method\s+IN\s*\([^)]*'voucher'[^)]*\)\s*\)/i
    );
  });

  it('orders status CHECK includes pending/success/cancelled/failed', () => {
    const statusCheck = ordersBody.match(/CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)\s*\)/i);
    expect(statusCheck).toBeTruthy();
    // Order-insensitive: reordering the values is not drift.
    for (const value of ['pending', 'success', 'cancelled', 'failed']) {
      expect(statusCheck[1]).toContain(`'${value}'`);
    }
  });

  it('orders declares topup_config JSONB (migration 099)', () => {
    expect(ordersBody).toMatch(/topup_config\s+JSONB/i);
  });

  it('bootstrap declares help center tables (migration 100)', () => {
    expect(bootstrapSql).toMatch(/CREATE TABLE help_articles\s*\(/i);
    expect(bootstrapSql).toMatch(/CREATE TABLE help_article_chunks\s*\(/i);
    expect(bootstrapSql).toMatch(/CREATE TABLE help_unanswered\s*\(/i);
  });
});
