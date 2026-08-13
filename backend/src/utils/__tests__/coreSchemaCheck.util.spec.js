import { describe, it, expect, jest } from '@jest/globals';
import { checkCoreSchema } from '../coreSchemaCheck.util.js';
import { CORE_SCHEMA_EXPECTED } from '../coreSchema.expected.js';

function mockQueryable(handlers) {
  return {
    query: jest.fn(async (sql, params) => {
      for (const handler of handlers) {
        const result = handler(sql, params);
        if (result !== undefined) return result;
      }
      throw new Error(`Unexpected query: ${String(sql).slice(0, 120)}`);
    }),
  };
}

/** Minimal rows so column-type checks pass against CORE_SCHEMA_EXPECTED.columns */
function okColumnRows() {
  const rows = [];
  for (const [table, cols] of Object.entries(CORE_SCHEMA_EXPECTED.columns)) {
    for (const [column, spec] of Object.entries(cols)) {
      rows.push({
        table_name: table,
        column_name: column,
        udt_name: spec.udt,
        is_nullable: spec.nullable ? 'YES' : 'NO',
        character_maximum_length: spec.maxLen ?? null,
      });
    }
  }
  return rows;
}

const TABLES = [
  { table_name: 'orders' },
  { table_name: 'plans' },
  { table_name: 'users' },
  { table_name: 'vouchers' },
];

const CHECKS_OK = [
  {
    conname: 'orders_status_check',
    def: "CHECK (status IN ('pending', 'success', 'cancelled', 'failed'))",
  },
  {
    conname: 'orders_payment_method_check',
    def: "CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher'))",
  },
  {
    conname: 'orders_billing_period_check',
    def: "CHECK (billing_period IN ('monthly', 'yearly'))",
  },
  {
    conname: 'orders_discount_source_check',
    def: "CHECK (discount_source IS NULL OR discount_source IN ('public_code', 'private_code', 'automatic'))",
  },
];

const FKS_OK = [
  {
    table_name: 'users',
    column_name: 'active_plan_id',
    ref_table: 'plans',
    ref_column: 'id',
    on_delete: 'n',
  },
  {
    table_name: 'orders',
    column_name: 'plan_id',
    ref_table: 'plans',
    ref_column: 'id',
    on_delete: 'a',
  },
  {
    table_name: 'orders',
    column_name: 'user_id',
    ref_table: 'users',
    ref_column: 'id',
    on_delete: 'a',
  },
  {
    table_name: 'plans',
    column_name: 'custom_owner_user_id',
    ref_table: 'users',
    ref_column: 'id',
    on_delete: 'n',
  },
];

function defaultOkHandler(sql) {
  if (sql.includes('information_schema.tables')) return { rows: TABLES };
  if (sql.includes('information_schema.columns') && sql.includes('udt_name')) {
    return { rows: okColumnRows() };
  }
  if (sql.includes('pg_constraint') && sql.includes("contype = 'c'")) {
    return { rows: CHECKS_OK };
  }
  if (sql.includes("contype = 'f'")) return { rows: FKS_OK };
  if (sql.includes('pg_index') && sql.includes('indisunique')) {
    return { rows: [{ table_name: 'orders', columns: ['order_code'] }] };
  }
  if (sql.includes('GROUP BY status')) {
    return { rows: [{ status: 'success', n: 2 }, { status: 'pending', n: 1 }] };
  }
  if (sql.includes('order_code::text')) return { rows: [] };
  if (sql.includes('COUNT(*)') && sql.includes('order_code IS NOT NULL')) {
    return { rows: [{ n: 3 }] };
  }
  if (sql.includes('payment_method IS NULL')) return { rows: [{ n: 0 }] };
  if (sql.includes('active_plan_id IS NOT NULL')) return { rows: [{ n: 0 }] };
  return undefined;
}

describe('checkCoreSchema', () => {
  it('ok khi đủ bảng, cột, kiểu, CHECK, FK, UNIQUE', async () => {
    const queryable = mockQueryable([defaultOkHandler]);
    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.drifts.filter((d) => d.kind !== 'order_code_uncastable')).toEqual([]);
  });

  it("fail khi thiếu 'voucher' trong payment_method CHECK", async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('pg_constraint') && sql.includes("contype = 'c'")) {
          return {
            rows: [
              CHECKS_OK[0],
              {
                conname: 'orders_payment_method_check',
                def: "CHECK (payment_method IN ('payos', 'manual', 'free'))",
              },
              CHECKS_OK[2],
            ],
          };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.includes("'voucher'"))).toBe(true);
  });

  it('fail khi order_code là varchar thay vì int8', async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('information_schema.columns') && sql.includes('udt_name')) {
          return {
            rows: okColumnRows().map((r) =>
              r.table_name === 'orders' && r.column_name === 'order_code'
                ? { ...r, udt_name: 'varchar' }
                : r
            ),
          };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.includes('order_code') && f.includes('varchar'))).toBe(
      true
    );
    expect(result.drifts.some((d) => d.kind === 'type' && d.column === 'order_code')).toBe(true);
  });

  it('fail khi thiếu FK users.active_plan_id', async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes("contype = 'f'")) {
          return { rows: FKS_OK.filter((f) => f.column_name !== 'active_plan_id') };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.includes('active_plan_id'))).toBe(true);
  });

  it("warning khi có status 'completed' legacy", async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('GROUP BY status')) {
          return { rows: [{ status: 'completed', n: 6 }] };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('completed'))).toBe(true);
  });

  it('warning khi order_code không ép BIGINT được', async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('order_code::text') && sql.includes('!~')) {
          return { rows: [{ id: 1, raw: 'ABC-99' }, { id: 2, raw: '12.5' }] };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('KHÔNG ép được'))).toBe(true);
    expect(result.drifts.some((d) => d.kind === 'order_code_uncastable')).toBe(true);
  });

  it('warning orphan active_plan_id', async () => {
    const queryable = mockQueryable([
      (sql) => {
        if (sql.includes('active_plan_id IS NOT NULL')) {
          return { rows: [{ n: 10 }] };
        }
        return defaultOkHandler(sql);
      },
    ]);

    const result = await checkCoreSchema(queryable);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('gói ma'))).toBe(true);
  });
});
