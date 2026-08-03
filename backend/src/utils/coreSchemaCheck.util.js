import { CORE_SCHEMA_EXPECTED } from './coreSchema.expected.js';

/**
 * @typedef {{ ok: boolean, failures: string[], warnings: string[] }} CoreSchemaCheckResult
 */

/**
 * Assert core schema facts against any Postgres (test, staging, production).
 * Read-only. Does not mutate data.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: object[] }> }} queryable
 * @param {typeof CORE_SCHEMA_EXPECTED} [expected]
 * @returns {Promise<CoreSchemaCheckResult>}
 */
export async function checkCoreSchema(queryable, expected = CORE_SCHEMA_EXPECTED) {
  const failures = [];
  const warnings = [];

  const { rows: tableRows } = await queryable.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [expected.tables]
  );
  const presentTables = tableRows.map((r) => r.table_name).sort();
  const expectedTables = [...expected.tables].sort();
  for (const name of expectedTables) {
    if (!presentTables.includes(name)) {
      failures.push(`Thiếu bảng public.${name}`);
    }
  }

  const { rows: userCols } = await queryable.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [expected.usersRequiredColumns]
  );
  const presentCols = new Set(userCols.map((r) => r.column_name));
  for (const col of expected.usersRequiredColumns) {
    if (!presentCols.has(col)) {
      failures.push(`users thiếu cột ${col} (cần migration 093)`);
    }
  }

  const { rows: checkRows } = await queryable.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass AND contype = 'c'`
  );
  const defs = checkRows.map((r) => String(r.def).toLowerCase());

  const statusDef = defs.find((d) => d.includes('status') && d.includes("'pending'"));
  if (!statusDef) {
    failures.push("orders thiếu CHECK status (pending/success/cancelled/failed) — cần migration 092");
  } else {
    for (const token of expected.ordersCheckMustContain.status) {
      if (!statusDef.includes(token.toLowerCase())) {
        failures.push(`orders status CHECK thiếu ${token}`);
      }
    }
  }

  const paymentDef = defs.find((d) => d.includes('payment_method'));
  if (!paymentDef) {
    failures.push('orders thiếu CHECK payment_method');
  } else {
    for (const token of expected.ordersCheckMustContain.payment_method) {
      if (!paymentDef.includes(token.toLowerCase())) {
        failures.push(
          `orders payment_method CHECK thiếu ${token}` +
            (token === "'voucher'" ? ' — đơn giảm 100% sẽ lỗi 500' : '')
        );
      }
    }
  }

  // Advisory: legacy statuses that block safe deploy of P0-5 / 092 UPDATE.
  try {
    const { rows: statusCounts } = await queryable.query(
      `SELECT status, COUNT(*)::int AS n
       FROM orders
       GROUP BY status
       ORDER BY n DESC`
    );
    for (const row of statusCounts) {
      const status = String(row.status);
      if (!expected.ordersAllowedStatuses.includes(status)) {
        warnings.push(
          `orders có ${row.n} dòng status='${status}' (ngoài danh sách hợp lệ) — xem 092 trước khi deploy P0-5`
        );
      }
    }
  } catch (err) {
    warnings.push(`Không đọc được phân bố orders.status: ${err.message}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
  };
}
