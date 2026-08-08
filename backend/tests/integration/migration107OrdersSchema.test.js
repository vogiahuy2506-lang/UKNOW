/**
 * Migration 107 — repair orders/users schema drift (PLAN_SCHEMA_BUOC2).
 *
 * Bootstrap đã ở hình post-107. Các bài:
 * 1) Chạy SQL 107 trên DB đã có UNIQUE+FK (mô phỏng Neon) → không lỗi
 * 2) Chạy lại nội dung SQL lần 2 → không lỗi (idempotent thật)
 * 3) Mô phỏng VPS lệch → 107 vá → check:schema OK + UNIQUE/FK hoạt động
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { stripOuterTransactionStatements } from '../../src/utils/migrationRunner.util.js';
import { checkCoreSchema } from '../../src/utils/coreSchemaCheck.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_107 = path.resolve(
  __dirname,
  '../../migrations/107_orders_users_schema_repair.sql'
);

function loadMigration107Sql() {
  return stripOuterTransactionStatements(fs.readFileSync(MIGRATION_107, 'utf8'));
}

async function runMigration107() {
  const sql = loadMigration107Sql();
  await db.query('BEGIN');
  try {
    await db.query(sql);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

beforeAll(() => {
  createApp();
});

beforeEach(async () => {
  await truncateAll();
});

describe('migration 107 orders/users schema repair', () => {
  it('chạy trên DB đã có UNIQUE+FK (Neon-like) rồi chạy lần 2 — không lỗi', async () => {
    await expect(runMigration107()).resolves.toBeUndefined();
    await expect(runMigration107()).resolves.toBeUndefined();

    const result = await checkCoreSchema(db);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('vá DB lệch kiểu VPS rồi chặn UNIQUE / FK orphan / xoá gói SET NULL', async () => {
    // ── Mô phỏng VPS trước 107 ──────────────────────────────────────
    await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_active_plan_id_fkey`);
    await db.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_code_key`);

    await db.query(`
      ALTER TABLE orders
        ALTER COLUMN order_code TYPE VARCHAR(64) USING order_code::text,
        ALTER COLUMN order_code DROP NOT NULL,
        ALTER COLUMN amount DROP NOT NULL,
        ALTER COLUMN status DROP NOT NULL,
        ALTER COLUMN discount_amount DROP NOT NULL,
        ALTER COLUMN payment_method DROP NOT NULL
    `);
    await db.query(`ALTER TABLE plans ALTER COLUMN is_custom DROP NOT NULL`);

    const plan = (
      await db.query(
        `INSERT INTO plans (code, name, price, is_active, is_custom)
         VALUES ('starter', 'Starter', 99000, TRUE, FALSE) RETURNING id`
      )
    ).rows[0];

    const userOk = await createUser({ role: 'user', username: 'schema_ok' });
    const userOrphan = await createUser({ role: 'user', username: 'schema_orphan' });

    // orphan active_plan_id (gói ma)
    await db.query(`UPDATE users SET active_plan_id = 999999 WHERE id = $1`, [userOrphan.id]);

    // 34-style NULL payment_method + varchar order_code
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, billing_period, discount_amount)
       VALUES ('5001', $1, 99000, $2, $3, 'pending', NULL, 'monthly', 0)`,
      [plan.id, userOk.email, userOk.id]
    );

    // ── Apply 107 ───────────────────────────────────────────────────
    await runMigration107();

    const nullPay = await db.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE payment_method IS NULL`
    );
    expect(nullPay.rows[0].n).toBe(0);

    const orphans = await db.query(
      `SELECT COUNT(*)::int AS n
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE u.active_plan_id IS NOT NULL AND p.id IS NULL`
    );
    expect(orphans.rows[0].n).toBe(0);

    const col = await db.query(
      `SELECT udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'orders' AND column_name = 'order_code'`
    );
    expect(col.rows[0].udt_name).toBe('int8');
    expect(col.rows[0].is_nullable).toBe('NO');

    const result = await checkCoreSchema(db);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);

    // UNIQUE
    await expect(
      db.query(
        `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method)
         VALUES (5001, $1, 100, $2, $3, 'pending', 'payos')`,
        [plan.id, userOk.email, userOk.id]
      )
    ).rejects.toThrow(/unique|duplicate/i);

    // FK orphan blocked
    await expect(
      db.query(`UPDATE users SET active_plan_id = 888888 WHERE id = $1`, [userOk.id])
    ).rejects.toThrow(/foreign key|violates/i);

    // ON DELETE SET NULL trên active_plan_id
    await db.query(`UPDATE users SET active_plan_id = $1 WHERE id = $2`, [plan.id, userOk.id]);
    // Không còn order trỏ plan → hard delete được; còn order thì NO ACTION chặn
    await db.query(`DELETE FROM orders WHERE plan_id = $1`, [plan.id]);
    await db.query(`DELETE FROM plans WHERE id = $1`, [plan.id]);
    const after = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [userOk.id]);
    expect(after.rows[0].active_plan_id).toBeNull();
  });

  it('xoá gói còn đơn hàng bị chặn bởi NO ACTION trên orders.plan_id', async () => {
    const plan = (
      await db.query(
        `INSERT INTO plans (code, name, price, is_active)
         VALUES ('keep', 'Keep', 1, TRUE) RETURNING id`
      )
    ).rows[0];
    const user = await createUser({ role: 'user', username: 'keep_hist' });
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method)
       VALUES (6001, $1, 1, $2, $3, 'success', 'payos')`,
      [plan.id, user.email, user.id]
    );

    await expect(db.query(`DELETE FROM plans WHERE id = $1`, [plan.id])).rejects.toThrow(
      /foreign key|violates/i
    );
  });
});
