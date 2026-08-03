import { describe, it, expect, jest } from '@jest/globals';
import { checkCoreSchema } from '../coreSchemaCheck.util.js';

function mockQueryable(handlers) {
  return {
    query: jest.fn(async (sql, params) => {
      for (const handler of handlers) {
        const result = handler(sql, params);
        if (result !== undefined) return result;
      }
      throw new Error(`Unexpected query: ${String(sql).slice(0, 80)}`);
    }),
  };
}

describe('checkCoreSchema', () => {
  it('ok khi đủ bảng, cột max_*, CHECK voucher + status', async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('information_schema.tables')) {
          return { rows: [{ table_name: 'orders' }, { table_name: 'plans' }, { table_name: 'users' }, { table_name: 'vouchers' }] };
        }
        if (sql.includes("table_name = 'users'")) {
          return {
            rows: [
              { column_name: 'max_campaigns' },
              { column_name: 'max_email_accounts' },
              { column_name: 'max_email_templates' },
              { column_name: 'max_employees' },
              { column_name: 'max_landing_pages' },
              { column_name: 'max_zalo_accounts' },
              { column_name: 'max_zalo_templates' },
            ],
          };
        }
        if (sql.includes('pg_constraint')) {
          return {
            rows: [
              { conname: 'orders_status_check', def: "CHECK (status IN ('pending', 'success', 'cancelled', 'failed'))" },
              { conname: 'orders_payment_method_check', def: "CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher'))" },
            ],
          };
        }
        if (sql.includes('GROUP BY status')) {
          return { rows: [{ status: 'success', n: 2 }, { status: 'pending', n: 1 }] };
        }
        return undefined;
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("fail khi thiếu 'voucher' trong payment_method CHECK", async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('information_schema.tables')) {
          return { rows: [{ table_name: 'orders' }, { table_name: 'plans' }, { table_name: 'users' }, { table_name: 'vouchers' }] };
        }
        if (sql.includes("table_name = 'users'")) {
          return {
            rows: [
              { column_name: 'max_campaigns' },
              { column_name: 'max_email_accounts' },
              { column_name: 'max_email_templates' },
              { column_name: 'max_employees' },
              { column_name: 'max_landing_pages' },
              { column_name: 'max_zalo_accounts' },
              { column_name: 'max_zalo_templates' },
            ],
          };
        }
        if (sql.includes('pg_constraint')) {
          return {
            rows: [
              { conname: 'orders_status_check', def: "CHECK (status IN ('pending', 'success', 'cancelled', 'failed'))" },
              { conname: 'orders_payment_method_check', def: "CHECK (payment_method IN ('payos', 'manual', 'free'))" },
            ],
          };
        }
        if (sql.includes('GROUP BY status')) {
          return { rows: [] };
        }
        return undefined;
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.includes("'voucher'"))).toBe(true);
  });

  it("warning khi có status 'completed' legacy", async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('information_schema.tables')) {
          return { rows: [{ table_name: 'orders' }, { table_name: 'plans' }, { table_name: 'users' }, { table_name: 'vouchers' }] };
        }
        if (sql.includes("table_name = 'users'")) {
          return {
            rows: [
              { column_name: 'max_campaigns' },
              { column_name: 'max_email_accounts' },
              { column_name: 'max_email_templates' },
              { column_name: 'max_employees' },
              { column_name: 'max_landing_pages' },
              { column_name: 'max_zalo_accounts' },
              { column_name: 'max_zalo_templates' },
            ],
          };
        }
        if (sql.includes('pg_constraint')) {
          return {
            rows: [
              { conname: 'orders_status_check', def: "CHECK (status IN ('pending', 'success', 'cancelled', 'failed'))" },
              { conname: 'orders_payment_method_check', def: "CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher'))" },
            ],
          };
        }
        if (sql.includes('GROUP BY status')) {
          return { rows: [{ status: 'completed', n: 6 }] };
        }
        return undefined;
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('completed'))).toBe(true);
  });
});
