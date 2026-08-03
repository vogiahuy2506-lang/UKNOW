/**
 * Expected core-schema facts (migrations 092/093 + bootstrap).
 * Shared by integration tests and `scripts/checkCoreSchema.js` (S-5).
 *
 * @see PLAN_SCHEMA_DRIFT.md S-2 / S-5
 */
export const CORE_SCHEMA_EXPECTED = Object.freeze({
  tables: Object.freeze(['users', 'plans', 'orders', 'vouchers']),
  usersRequiredColumns: Object.freeze([
    'max_employees',
    'max_campaigns',
    'max_zalo_accounts',
    'max_email_accounts',
    'max_email_templates',
    'max_zalo_templates',
    'max_landing_pages',
  ]),
  ordersCheckMustContain: Object.freeze({
    status: Object.freeze(["'pending'", "'success'", "'cancelled'", "'failed'"]),
    payment_method: Object.freeze(["'payos'", "'manual'", "'free'", "'voucher'"]),
  }),
  /** Allowed orders.status values after 092. Extra values = drift / legacy. */
  ordersAllowedStatuses: Object.freeze(['pending', 'success', 'cancelled', 'failed']),
});

export default CORE_SCHEMA_EXPECTED;
