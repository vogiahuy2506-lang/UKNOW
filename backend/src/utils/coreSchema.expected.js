/**
 * Expected core-schema facts (bootstrap.sql + migrations 092/093).
 * Shared by integration tests and `scripts/checkCoreSchema.js` (S-5 / PR3 bước 1).
 *
 * `columns` / `foreignKeys` / `uniques` / `checkMustContain` mirror bootstrap —
 * the source of truth for “schema mong muốn”. Production may drift silently
 * (baseline 001–009, ADD COLUMN IF NOT EXISTS swallowing CHECK/NOT NULL).
 *
 * @see PLAN_THANH_TOAN_TRUOC_MO_BAN.md Việc 3a
 */

/** @typedef {{ udt: string, nullable: boolean, maxLen?: number|null }} ExpectedColumn */

/** @type {Readonly<Record<string, Readonly<Record<string, ExpectedColumn>>>>} */
const COLUMNS = Object.freeze({
  users: Object.freeze({
    id: Object.freeze({ udt: 'int8', nullable: false }),
    active_plan_id: Object.freeze({ udt: 'int8', nullable: true }),
    email: Object.freeze({ udt: 'varchar', nullable: false, maxLen: 255 }),
    must_change_password: Object.freeze({ udt: 'bool', nullable: false }),
    subscription_reminder_count: Object.freeze({ udt: 'int4', nullable: false }),
    max_employees: Object.freeze({ udt: 'int4', nullable: true }),
    max_campaigns: Object.freeze({ udt: 'int4', nullable: true }),
    max_zalo_accounts: Object.freeze({ udt: 'int4', nullable: true }),
    max_email_accounts: Object.freeze({ udt: 'int4', nullable: true }),
    max_email_templates: Object.freeze({ udt: 'int4', nullable: true }),
    max_zalo_templates: Object.freeze({ udt: 'int4', nullable: true }),
    max_landing_pages: Object.freeze({ udt: 'int4', nullable: true }),
  }),
  orders: Object.freeze({
    id: Object.freeze({ udt: 'int8', nullable: false }),
    order_code: Object.freeze({ udt: 'int8', nullable: false }),
    plan_id: Object.freeze({ udt: 'int8', nullable: true }),
    amount: Object.freeze({ udt: 'int8', nullable: false }),
    user_id: Object.freeze({ udt: 'int8', nullable: true }),
    status: Object.freeze({ udt: 'varchar', nullable: false, maxLen: 20 }),
    payment_method: Object.freeze({ udt: 'varchar', nullable: false, maxLen: 20 }),
    billing_period: Object.freeze({ udt: 'varchar', nullable: false, maxLen: 10 }),
    discount_amount: Object.freeze({ udt: 'numeric', nullable: false }),
    voucher_id: Object.freeze({ udt: 'int8', nullable: true }),
    note: Object.freeze({ udt: 'text', nullable: true }),
    topup_config: Object.freeze({ udt: 'jsonb', nullable: true }),
  }),
  plans: Object.freeze({
    id: Object.freeze({ udt: 'int8', nullable: false }),
    is_custom: Object.freeze({ udt: 'bool', nullable: false }),
    grace_period_days: Object.freeze({ udt: 'int4', nullable: false }),
    custom_owner_user_id: Object.freeze({ udt: 'int8', nullable: true }),
  }),
});

export const CORE_SCHEMA_EXPECTED = Object.freeze({
  tables: Object.freeze(['users', 'plans', 'orders', 'vouchers']),

  /** @deprecated Prefer columns.users — kept for callers that only list max_* presence */
  usersRequiredColumns: Object.freeze([
    'max_employees',
    'max_campaigns',
    'max_zalo_accounts',
    'max_email_accounts',
    'max_email_templates',
    'max_zalo_templates',
    'max_landing_pages',
  ]),

  columns: COLUMNS,

  /**
   * CHECK defs must include these tokens (case-insensitive substring match
   * against pg_get_constraintdef).
   */
  ordersCheckMustContain: Object.freeze({
    status: Object.freeze(["'pending'", "'success'", "'cancelled'", "'failed'"]),
    payment_method: Object.freeze(["'payos'", "'manual'", "'free'", "'voucher'"]),
    billing_period: Object.freeze(["'monthly'", "'yearly'"]),
  }),

  /** Allowed orders.status values after 092. Extra values = drift / legacy. */
  ordersAllowedStatuses: Object.freeze(['pending', 'success', 'cancelled', 'failed']),

  foreignKeys: Object.freeze([
    Object.freeze({
      table: 'users',
      column: 'active_plan_id',
      refTable: 'plans',
      refColumn: 'id',
      onDelete: 'SET NULL',
      note: 'migration 002 — trong baseline 001–009 nên có thể chưa bao giờ chạy',
    }),
    Object.freeze({
      table: 'orders',
      column: 'plan_id',
      refTable: 'plans',
      refColumn: 'id',
      onDelete: 'SET NULL',
    }),
    Object.freeze({
      table: 'orders',
      column: 'user_id',
      refTable: 'users',
      refColumn: 'id',
      onDelete: 'SET NULL',
    }),
    // voucher_id FK: migration 036 — bootstrap chưa khai REFERENCES; báo riêng khi
    // đối chiếu prod (bước 2). Không đưa vào expected để test bootstrap không fail oan.
    Object.freeze({
      table: 'plans',
      column: 'custom_owner_user_id',
      refTable: 'users',
      refColumn: 'id',
      onDelete: 'SET NULL',
      note: 'migration 096 ADD COLUMN IF NOT EXISTS',
    }),
  ]),

  /**
   * Unique: column set must be covered by a unique index or UNIQUE constraint.
   */
  uniques: Object.freeze([
    Object.freeze({ table: 'orders', columns: Object.freeze(['order_code']) }),
  ]),

  /**
   * High-risk facts from `ADD COLUMN IF NOT EXISTS ... CHECK/NOT NULL/REFERENCES`.
   * If the column already existed when the migration ran, Postgres skipped the
   * whole clause — migration marked applied, constraint never added.
   */
  riskyAddColumnFacts: Object.freeze([
    Object.freeze({
      table: 'orders',
      column: 'payment_method',
      kind: 'not_null',
      migration: '018',
    }),
    Object.freeze({
      table: 'orders',
      column: 'payment_method',
      kind: 'check',
      mustContain: Object.freeze(["'payos'", "'voucher'"]),
      migration: '018→092',
    }),
    Object.freeze({
      table: 'orders',
      column: 'billing_period',
      kind: 'not_null',
      migration: '034',
    }),
    Object.freeze({
      table: 'orders',
      column: 'billing_period',
      kind: 'check',
      mustContain: Object.freeze(["'monthly'", "'yearly'"]),
      migration: '034',
    }),
    Object.freeze({
      table: 'orders',
      column: 'discount_amount',
      kind: 'not_null',
      migration: '036',
    }),
    Object.freeze({
      table: 'users',
      column: 'must_change_password',
      kind: 'not_null',
      migration: '094',
    }),
    Object.freeze({
      table: 'plans',
      column: 'is_custom',
      kind: 'not_null',
      migration: '006',
    }),
    Object.freeze({
      table: 'plans',
      column: 'grace_period_days',
      kind: 'not_null',
      migration: '073',
    }),
  ]),
});

export default CORE_SCHEMA_EXPECTED;
