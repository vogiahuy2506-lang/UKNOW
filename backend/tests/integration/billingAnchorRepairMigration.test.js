import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import { createPlan, createUser, truncateAll } from './helpers/db.js';
import { prepareBillingAnchorRepairPreflight } from '../../src/utils/billingAnchorRepairBackup.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSql = fs.readFileSync(
  path.join(__dirname, '../../migrations/174_repair_billing_cycle_anchors.sql'),
  'utf8'
);

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

let backupDir;

async function runMigrationWithPreflight() {
  await prepareBillingAnchorRepairPreflight(db, { backupDir });
  await db.query(migrationSql);
}

async function insertPlanOrder({
  orderCode,
  planId,
  user,
  paidAt,
  billingPeriod = 'yearly',
  note = null,
  topupConfig = null,
}) {
  await db.query(
    `INSERT INTO orders (
       order_code, plan_id, user_id, user_email, amount, status, payment_method,
       billing_period, note, topup_config, paid_at, created_at
     ) VALUES ($1, $2, $3, $4, 0, 'success', 'voucher', $5, $6, $7, $8, $8)`,
    [orderCode, planId, user.id, user.email, billingPeriod, note, topupConfig, paidAt]
  );
}

describe('Migration 174 — repair billing cycle anchors', () => {
  beforeEach(async () => {
    await truncateAll();
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uknow-anchor-repair-'));
  });

  afterEach(async () => {
    try {
      await truncateAll();
    } finally {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it('allows a clean database with no active entitlements to cross migration 174 without a preflight manifest', async () => {
    // This matches first boot after migrations 001–173: `users` exists, but
    // there cannot yet be a paid entitlement whose anchor needs repair.
    await db.query(
      'DROP TABLE IF EXISTS migration_runner_repair_results, migration_runner_preflight_backups'
    );

    await expect(db.query(migrationSql)).resolves.toBeDefined();

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS active_entitlements,
              to_regclass('public.migration_runner_preflight_backups') AS preflight_table,
              to_regclass('public.migration_runner_repair_results') AS repair_result_table
       FROM users
       WHERE active_plan_id IS NOT NULL`
    );
    expect(rows[0].active_entitlements).toBe(0);
    expect(rows[0].preflight_table).toBe('migration_runner_preflight_backups');
    expect(rows[0].repair_result_table).toBe('migration_runner_repair_results');
  });

  it('still fails closed without a preflight manifest when active entitlements exist', async () => {
    const plan = await createPlan({ code: 'anchor-repair-preflight-required', price: 299000 });
    const user = await createUser({ withPlan: false, email: 'preflight-required@example.com' });
    await db.query('UPDATE users SET active_plan_id = $1 WHERE id = $2', [plan.id, user.id]);
    await db.query(
      "DELETE FROM migration_runner_preflight_backups WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'"
    );

    await expect(db.query(migrationSql)).rejects.toThrow('requires a fresh billing-anchor preflight backup');
  });

  it('rejects a malformed manifest rather than publishing incorrect repair counts', async () => {
    const plan = await createPlan({ code: 'anchor-repair-invalid-manifest', price: 299000 });
    const user = await createUser({ withPlan: false, email: 'invalid-manifest@example.com' });
    await db.query('UPDATE users SET active_plan_id = $1 WHERE id = $2', [plan.id, user.id]);
    await db.query(
      `INSERT INTO migration_runner_preflight_backups (
         migration_filename, backup_path, content_sha256, row_count, rows
       ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        '174_repair_billing_cycle_anchors.sql',
        '/tmp/not-a-real-backup.json',
        'a'.repeat(64),
        1,
        '[]',
      ]
    );

    await expect(db.query(migrationSql)).rejects.toThrow('preflight manifest is invalid');
  });

  it('repairs the customer-like monthly → yearly history, preserves entitlement, and is idempotent', async () => {
    const starter = await createPlan({ code: 'starter-anchor-repair', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'anchor-repair@example.com' });
    const monthlyPaidAt = daysFromNow(-15);
    const yearlyPaidAt = daysFromNow(-8);
    const expiry = daysFromNow(380);
    const invalidAnchor = daysFromNow(350);

    await insertPlanOrder({ orderCode: 174001, planId: starter.id, user, paidAt: monthlyPaidAt });
    await insertPlanOrder({ orderCode: 174002, planId: starter.id, user, paidAt: yearlyPaidAt });
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, invalidAnchor, user.id]
    );

    const { rows: beforeBackupRows } = await db.query(
      'SELECT updated_at::text AS updated_at FROM users WHERE id = $1',
      [user.id]
    );
    await prepareBillingAnchorRepairPreflight(db, { backupDir });
    const { rows: manifestRows } = await db.query(
      `SELECT rows, backup_path
       FROM migration_runner_preflight_backups
       WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'`
    );
    expect(path.dirname(manifestRows[0].backup_path)).toBe(backupDir);
    expect(fs.existsSync(manifestRows[0].backup_path)).toBe(true);
    expect(manifestRows[0].rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: user.id,
        updated_at: beforeBackupRows[0].updated_at,
      }),
    ]));

    await db.query(migrationSql);

    const first = await db.query(
      `SELECT active_plan_id, subscription_expires_at, plan_activated_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(first.rows[0].active_plan_id).toBe(starter.id);
    expect(new Date(first.rows[0].subscription_expires_at).getTime()).toBe(expiry.getTime());
    expect(new Date(first.rows[0].plan_activated_at).getTime()).toBe(yearlyPaidAt.getTime());

    const { rows: repairResultRows } = await db.query(
      `SELECT preflight_row_count, repaired_row_count, skipped_row_count
       FROM migration_runner_repair_results
       WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'`
    );
    expect(repairResultRows).toEqual([{
      preflight_row_count: 1,
      repaired_row_count: 1,
      skipped_row_count: 0,
    }]);

    await runMigrationWithPreflight();
    const second = await db.query(
      `SELECT active_plan_id, subscription_expires_at, plan_activated_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(second.rows).toEqual(first.rows);
  });

  it('uses the newest same-plan checkout when an older monthly webhook arrives later', async () => {
    const starter = await createPlan({ code: 'starter-anchor-same-plan-order', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'anchor-same-plan-order@example.com' });
    // The yearly checkout has the newer ID and wins entitlement. Its webhook
    // arrives first, therefore the older monthly order receives the later
    // paid_at and must not become the repaired anchor.
    const yearlyPaidAt = daysFromNow(-9);
    const lateMonthlyPaidAt = daysFromNow(-6);
    const expiry = daysFromNow(360);
    const invalidAnchor = daysFromNow(320);

    await insertPlanOrder({
      orderCode: 174008,
      planId: starter.id,
      user,
      paidAt: lateMonthlyPaidAt,
      billingPeriod: 'monthly',
    });
    await insertPlanOrder({
      orderCode: 174009,
      planId: starter.id,
      user,
      paidAt: yearlyPaidAt,
      billingPeriod: 'yearly',
    });
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, invalidAnchor, user.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      'SELECT plan_activated_at FROM users WHERE id = $1',
      [user.id]
    );
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(yearlyPaidAt.getTime());
  });

  it('uses the linked scheduled checkout over an older direct callback with a later paid_at', async () => {
    const starter = await createPlan({ code: 'starter-anchor-linked-scheduled', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'anchor-linked-scheduled@example.com' });
    const scheduledActivatedAt = daysFromNow(-12);
    const lateDirectPaidAt = daysFromNow(-3);
    const expiry = daysFromNow(360);
    const invalidAnchor = daysFromNow(320);

    // This direct monthly checkout has the smaller ID but a later paid_at,
    // reproducing a delayed PayOS callback after the scheduled yearly intent.
    await insertPlanOrder({
      orderCode: 174010,
      planId: starter.id,
      user,
      paidAt: lateDirectPaidAt,
      billingPeriod: 'monthly',
    });
    const { rows: scheduledOrderRows } = await db.query(
      `INSERT INTO orders (
         order_code, plan_id, user_id, user_email, amount, status, payment_method,
         billing_period, note, paid_at, created_at
       ) VALUES ($1, $2, $3, $4, 0, 'success', 'voucher', 'yearly',
                 'scheduled_change', $5, $5)
       RETURNING id`,
      [174011, starter.id, user.id, user.email, scheduledActivatedAt]
    );
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, order_id, amount_paid, status,
         activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', $3, 0, 'activated', $4, $4)`,
      [user.id, starter.id, scheduledOrderRows[0].id, scheduledActivatedAt]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, invalidAnchor, user.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      'SELECT plan_activated_at FROM users WHERE id = $1',
      [user.id]
    );
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(scheduledActivatedAt.getTime());
  });

  it('uses a direct checkout created after an unlinked legacy scheduled change', async () => {
    const starter = await createPlan({ code: 'starter-anchor-legacy-scheduled-renewal', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'anchor-legacy-scheduled-renewal@example.com' });
    const legacyActivatedAt = daysFromNow(-15);
    const directPaidAt = daysFromNow(-5);
    const expiry = daysFromNow(360);
    const invalidAnchor = daysFromNow(320);

    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, amount_paid, status, activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', 0, 'activated', $3, $3)`,
      [user.id, starter.id, legacyActivatedAt]
    );
    await insertPlanOrder({
      orderCode: 174012,
      planId: starter.id,
      user,
      paidAt: directPaidAt,
      billingPeriod: 'monthly',
    });
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, invalidAnchor, user.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      'SELECT plan_activated_at FROM users WHERE id = $1',
      [user.id]
    );
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(directPaidAt.getTime());
  });

  it('uses an activated scheduled change, ignores a newer top-up, and leaves rows without evidence untouched', async () => {
    const starter = await createPlan({ code: 'starter-scheduled-anchor', price: 299000, durationDays: 30 });
    const scheduledUser = await createUser({ withPlan: false, email: 'scheduled-anchor@example.com' });
    const unresolvedUser = await createUser({ withPlan: false, email: 'manual-anchor@example.com' });
    const directPaidAt = daysFromNow(-20);
    const scheduledActivatedAt = daysFromNow(-10);
    const expiry = daysFromNow(360);
    const invalidAnchor = daysFromNow(320);

    await insertPlanOrder({ orderCode: 174003, planId: starter.id, user: scheduledUser, paidAt: directPaidAt });
    await insertPlanOrder({
      orderCode: 174004,
      planId: starter.id,
      user: scheduledUser,
      paidAt: daysFromNow(-2),
      note: 'topup',
      topupConfig: { items: { emails: 1 } },
    });
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, status, activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', 'activated', $3, $3)`,
      [scheduledUser.id, starter.id, scheduledActivatedAt]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id IN ($4, $5)`,
      [starter.id, expiry, invalidAnchor, scheduledUser.id, unresolvedUser.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      `SELECT id, plan_activated_at
       FROM users WHERE id IN ($1, $2) ORDER BY id`,
      [scheduledUser.id, unresolvedUser.id]
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(new Date(byId.get(scheduledUser.id).plan_activated_at).getTime())
      .toBe(scheduledActivatedAt.getTime());
    expect(new Date(byId.get(unresolvedUser.id).plan_activated_at).getTime())
      .toBe(invalidAnchor.getTime());
  });

  it('repairs a past anchor that matches the old expiry-minus-30-days formula', async () => {
    const starter = await createPlan({ code: 'starter-past-anchor-repair', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'past-anchor-repair@example.com' });
    const yearlyPaidAt = daysFromNow(-340);
    const expiry = daysFromNow(25);
    // This is what migration 150 generated. It is in the past and before expiry,
    // so a simple NULL/future/after-expiry validation would incorrectly accept it.
    const pastButWrongAnchor = new Date(expiry.getTime() - 30 * 24 * 60 * 60 * 1000);

    await insertPlanOrder({ orderCode: 174005, planId: starter.id, user, paidAt: yearlyPaidAt });
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, pastButWrongAnchor, user.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      `SELECT active_plan_id, subscription_expires_at, plan_activated_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(rows[0].active_plan_id).toBe(starter.id);
    expect(new Date(rows[0].subscription_expires_at).getTime()).toBe(expiry.getTime());
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(yearlyPaidAt.getTime());
  });

  it('preserves PostgreSQL microseconds in the preflight manifest and still repairs the row', async () => {
    const starter = await createPlan({ code: 'starter-preflight-microseconds', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'preflight-microseconds@example.com' });

    await db.query(
      `INSERT INTO orders (
         order_code, plan_id, user_id, user_email, amount, status, payment_method,
         billing_period, paid_at, created_at
       ) VALUES ($1, $2, $3, $4, 0, 'success', 'voucher', 'yearly',
                 NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days')`,
      [174007, starter.id, user.id, user.email]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '360 days',
           plan_activated_at = NOW() + INTERVAL '320 days'
       WHERE id = $2`,
      [starter.id, user.id]
    );

    await runMigrationWithPreflight();

    const { rows } = await db.query(
      `SELECT u.plan_activated_at, o.paid_at
       FROM users u
       JOIN orders o ON o.user_id = u.id
       WHERE u.id = $1`,
      [user.id]
    );
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(
      new Date(rows[0].paid_at).getTime()
    );
  });

  it('does not repair a row whose entitlement fields changed after the preflight backup', async () => {
    const starter = await createPlan({ code: 'starter-preflight-race', price: 299000, durationDays: 30 });
    const user = await createUser({ withPlan: false, email: 'preflight-race@example.com' });
    const paidAt = daysFromNow(-20);
    const expiry = daysFromNow(360);
    const firstInvalidAnchor = daysFromNow(320);
    const laterInvalidAnchor = daysFromNow(300);

    await insertPlanOrder({ orderCode: 174006, planId: starter.id, user, paidAt });
    await db.query(
      `UPDATE users
       SET active_plan_id = $1, subscription_expires_at = $2, plan_activated_at = $3
       WHERE id = $4`,
      [starter.id, expiry, firstInvalidAnchor, user.id]
    );

    await prepareBillingAnchorRepairPreflight(db, { backupDir });

    // Simulate an entitlement mutation after backup. The migration may still
    // resolve this row, but must not overwrite a state it did not back up.
    await db.query(
      'UPDATE users SET plan_activated_at = $1 WHERE id = $2',
      [laterInvalidAnchor, user.id]
    );
    await db.query(migrationSql);

    const { rows } = await db.query(
      'SELECT plan_activated_at FROM users WHERE id = $1',
      [user.id]
    );
    expect(new Date(rows[0].plan_activated_at).getTime()).toBe(laterInvalidAnchor.getTime());

    const { rows: repairResultRows } = await db.query(
      `SELECT preflight_row_count, repaired_row_count, skipped_row_count
       FROM migration_runner_repair_results
       WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'`
    );
    expect(repairResultRows).toEqual([{
      preflight_row_count: 1,
      repaired_row_count: 0,
      skipped_row_count: 1,
    }]);
  });
});
