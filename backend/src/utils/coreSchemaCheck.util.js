import { CORE_SCHEMA_EXPECTED } from './coreSchema.expected.js';

/**
 * @typedef {{
 *   kind: string,
 *   table?: string,
 *   column?: string,
 *   expected?: string,
 *   actual?: string,
 *   detail: string,
 * }} SchemaDrift
 *
 * @typedef {{
 *   ok: boolean,
 *   failures: string[],
 *   warnings: string[],
 *   drifts: SchemaDrift[],
 * }} CoreSchemaCheckResult
 */

const BIGINT_MAX = '9223372036854775807';

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
  /** @type {SchemaDrift[]} */
  const drifts = [];

  const pushFail = (detail, drift = null) => {
    failures.push(detail);
    if (drift) drifts.push({ ...drift, detail });
  };

  // ── Tables ──────────────────────────────────────────────────────────
  const { rows: tableRows } = await queryable.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [expected.tables]
  );
  const presentTables = new Set(tableRows.map((r) => r.table_name));
  for (const name of expected.tables) {
    if (!presentTables.has(name)) {
      pushFail(`Thiếu bảng public.${name}`, {
        kind: 'missing_table',
        table: name,
        expected: 'exists',
        actual: 'missing',
      });
    }
  }

  // ── Columns: presence + type + nullability ─────────────────────────
  const columnTables = Object.keys(expected.columns || {});
  if (columnTables.length) {
    const { rows: colRows } = await queryable.query(
      `SELECT table_name, column_name, udt_name, is_nullable, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [columnTables]
    );
    /** @type {Map<string, object>} */
    const colMap = new Map();
    for (const row of colRows) {
      colMap.set(`${row.table_name}.${row.column_name}`, row);
    }

    for (const [table, cols] of Object.entries(expected.columns)) {
      if (!presentTables.has(table)) continue;
      for (const [column, spec] of Object.entries(cols)) {
        const key = `${table}.${column}`;
        const row = colMap.get(key);
        if (!row) {
          pushFail(`${table} thiếu cột ${column}`, {
            kind: 'missing_column',
            table,
            column,
            expected: 'exists',
            actual: 'missing',
          });
          continue;
        }

        const actualUdt = normalizeUdt(row.udt_name);
        const expectedUdt = normalizeUdt(spec.udt);
        if (actualUdt !== expectedUdt) {
          // int4 vs int8: report but treat as failure (known drift for active_plan_id / order_code)
          pushFail(
            `${table}.${column} kiểu lệch: kỳ vọng ${expectedUdt}, thực tế ${actualUdt}`,
            {
              kind: 'type',
              table,
              column,
              expected: expectedUdt,
              actual: actualUdt,
            }
          );
        }

        const expectNullable = Boolean(spec.nullable);
        const actualNullable = String(row.is_nullable).toUpperCase() === 'YES';
        if (expectNullable !== actualNullable) {
          pushFail(
            `${table}.${column} nullability lệch: kỳ vọng ${expectNullable ? 'NULL' : 'NOT NULL'}, thực tế ${actualNullable ? 'NULL' : 'NOT NULL'}`,
            {
              kind: 'nullability',
              table,
              column,
              expected: expectNullable ? 'NULL' : 'NOT NULL',
              actual: actualNullable ? 'NULL' : 'NOT NULL',
            }
          );
        }

        if (spec.maxLen != null && row.character_maximum_length != null) {
          const actualLen = Number(row.character_maximum_length);
          if (actualLen !== Number(spec.maxLen)) {
            warnings.push(
              `${table}.${column} varchar length: kỳ vọng ${spec.maxLen}, thực tế ${actualLen}`
            );
            drifts.push({
              kind: 'varchar_length',
              table,
              column,
              expected: String(spec.maxLen),
              actual: String(actualLen),
              detail: `${table}.${column} varchar length drift`,
            });
          }
        }
      }
    }
  } else {
    // Legacy path: only max_* presence (unit tests without columns map)
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
  }

  // ── CHECK constraints on orders (and any table in checkMustContain) ─
  if (presentTables.has('orders')) {
    const { rows: checkRows } = await queryable.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'public.orders'::regclass AND contype = 'c'`
    );
    const defs = checkRows.map((r) => ({
      name: r.conname,
      def: String(r.def).toLowerCase(),
    }));

    for (const [column, tokens] of Object.entries(expected.ordersCheckMustContain || {})) {
      const match = defs.find((d) => d.def.includes(column.toLowerCase()));
      if (!match) {
        pushFail(`orders thiếu CHECK ${column}`, {
          kind: 'check',
          table: 'orders',
          column,
          expected: `CHECK including ${tokens.join(',')}`,
          actual: 'missing',
        });
        continue;
      }
      for (const token of tokens) {
        if (!match.def.includes(token.toLowerCase())) {
          pushFail(
            `orders ${column} CHECK thiếu ${token}` +
              (token === "'voucher'" ? ' — đơn giảm 100% sẽ lỗi 500' : ''),
            {
              kind: 'check',
              table: 'orders',
              column,
              expected: token,
              actual: match.def.slice(0, 120),
            }
          );
        }
      }
    }
  }

  // ── Foreign keys ───────────────────────────────────────────────────
  if (expected.foreignKeys?.length) {
    const { rows: fkRows } = await queryable.query(
      `SELECT
         src.relname AS table_name,
         src_att.attname AS column_name,
         tgt.relname AS ref_table,
         tgt_att.attname AS ref_column,
         conf.confdeltype AS on_delete
       FROM pg_constraint conf
       JOIN pg_class src ON src.oid = conf.conrelid
       JOIN pg_namespace nsp ON nsp.oid = src.relnamespace AND nsp.nspname = 'public'
       JOIN pg_class tgt ON tgt.oid = conf.confrelid
       JOIN LATERAL unnest(conf.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
       JOIN LATERAL unnest(conf.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
       JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = ck.attnum
       JOIN pg_attribute tgt_att ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = fk.attnum
       WHERE conf.contype = 'f'`
    );

    const fkKey = (r) =>
      `${r.table_name}.${r.column_name}->${r.ref_table}.${r.ref_column}`;
    const presentFks = new Map(fkRows.map((r) => [fkKey(r), r]));

    for (const want of expected.foreignKeys) {
      if (!presentTables.has(want.table)) continue;
      const key = `${want.table}.${want.column}->${want.refTable}.${want.refColumn}`;
      const found = presentFks.get(key);
      if (!found) {
        pushFail(
          `Thiếu FK ${key}` + (want.note ? ` (${want.note})` : ''),
          {
            kind: 'foreign_key',
            table: want.table,
            column: want.column,
            expected: key,
            actual: 'missing',
          }
        );
        continue;
      }
      const actualOnDelete = mapConfdeltype(found.on_delete);
      if (want.onDelete && actualOnDelete !== want.onDelete) {
        pushFail(
          `FK ${key} ON DELETE lệch: kỳ vọng ${want.onDelete}, thực tế ${actualOnDelete}`,
          {
            kind: 'foreign_key_on_delete',
            table: want.table,
            column: want.column,
            expected: want.onDelete,
            actual: actualOnDelete,
          }
        );
      }
    }
  }

  // ── Unique constraints / unique indexes ────────────────────────────
  if (expected.uniques?.length) {
    // json_agg → node-pg luôn parse thành mảng JS (array_agg đôi khi ra string '{col}')
    const { rows: uniqRows } = await queryable.query(
      `SELECT
         t.relname AS table_name,
         json_agg(a.attname ORDER BY x.ordinality) AS columns
       FROM pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
       WHERE ix.indisunique = true
       GROUP BY t.relname, ix.indexrelid`
    );

    for (const want of expected.uniques) {
      if (!presentTables.has(want.table)) continue;
      const wantCols = want.columns.map(String);
      const found = uniqRows.some((row) => {
        if (row.table_name !== want.table) return false;
        const cols = normalizePgTextArray(row.columns);
        return cols.length === wantCols.length && wantCols.every((c, i) => cols[i] === c);
      });
      if (!found) {
        pushFail(`${want.table} thiếu UNIQUE (${wantCols.join(', ')})`, {
          kind: 'unique',
          table: want.table,
          column: wantCols.join(','),
          expected: `UNIQUE(${wantCols.join(',')})`,
          actual: 'missing',
        });
      }
    }
  }
  // ── Data probes (warnings — inform migration scope, don't invent fixes) ─
  if (presentTables.has('orders')) {
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
            `orders có ${row.n} dòng status='${status}' (ngoài danh sách hợp lệ) — xem 092 trước khi deploy sửa status`
          );
        }
      }
    } catch (err) {
      warnings.push(`Không đọc được phân bố orders.status: ${err.message}`);
    }

    try {
      const { rows: badCodes } = await queryable.query(
        `SELECT id, order_code::text AS raw
         FROM orders
         WHERE order_code IS NOT NULL
           AND (
             trim(order_code::text) !~ '^[0-9]+$'
             OR trim(order_code::text)::numeric > $1::numeric
           )
         ORDER BY id
         LIMIT 50`,
        [BIGINT_MAX]
      );
      if (badCodes.length) {
        const sample = badCodes
          .slice(0, 10)
          .map((r) => `id=${r.id} raw=${JSON.stringify(r.raw)}`)
          .join('; ');
        warnings.push(
          `orders.order_code: ${badCodes.length}+ giá trị KHÔNG ép được sang BIGINT — migration đổi kiểu sẽ fail. Mẫu: ${sample}`
        );
        drifts.push({
          kind: 'order_code_uncastable',
          table: 'orders',
          column: 'order_code',
          expected: 'BIGINT-castable digits',
          actual: `${badCodes.length}+ rows`,
          detail: sample,
        });
      } else {
        const { rows: totalRows } = await queryable.query(
          `SELECT COUNT(*)::int AS n FROM orders WHERE order_code IS NOT NULL`
        );
        const n = totalRows[0]?.n ?? 0;
        if (n > 0) {
          warnings.push(
            `orders.order_code: ${n} giá trị đều ép được sang BIGINT (an toàn cho đổi kiểu — vẫn sao lưu trước)`
          );
        }
      }
    } catch (err) {
      warnings.push(`Không kiểm được order_code castability: ${err.message}`);
    }

    try {
      const { rows: nullPay } = await queryable.query(
        `SELECT COUNT(*)::int AS n FROM orders WHERE payment_method IS NULL`
      );
      if (nullPay[0]?.n > 0) {
        warnings.push(
          `orders.payment_method: ${nullPay[0].n} dòng NULL — phải backfill trước khi thêm NOT NULL`
        );
        drifts.push({
          kind: 'null_data',
          table: 'orders',
          column: 'payment_method',
          expected: 'non-null',
          actual: `${nullPay[0].n} NULL`,
          detail: 'backfill before NOT NULL',
        });
      }
    } catch (err) {
      warnings.push(`Không đếm được payment_method NULL: ${err.message}`);
    }
  }

  if (presentTables.has('users') && presentTables.has('plans')) {
    try {
      const { rows: orphans } = await queryable.query(
        `SELECT COUNT(*)::int AS n
         FROM users u
         LEFT JOIN plans p ON p.id = u.active_plan_id
         WHERE u.active_plan_id IS NOT NULL AND p.id IS NULL`
      );
      if (orphans[0]?.n > 0) {
        warnings.push(
          `users.active_plan_id: ${orphans[0].n} tài khoản trỏ gói ma — phải NULL-out trước khi thêm FK`
        );
        drifts.push({
          kind: 'orphan_fk_data',
          table: 'users',
          column: 'active_plan_id',
          expected: 'NULL or existing plans.id',
          actual: `${orphans[0].n} orphans`,
          detail: 'clean before ADD CONSTRAINT',
        });
      }
    } catch (err) {
      warnings.push(`Không kiểm được orphan active_plan_id: ${err.message}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    drifts,
  };
}

function normalizeUdt(udt) {
  const u = String(udt || '').toLowerCase();
  // information_schema may report varchar; pg reports varchar — keep as-is
  if (u === 'int8' || u === 'bigint') return 'int8';
  if (u === 'int4' || u === 'integer') return 'int4';
  if (u === 'int2' || u === 'smallint') return 'int2';
  if (u === 'bool' || u === 'boolean') return 'bool';
  return u;
}

/** node-pg / drivers sometimes return PG arrays as JS arrays, JSON, or '{a,b}' strings. */
function normalizePgTextArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1);
      if (!inner) return [];
      return inner.split(',').map((part) => part.replace(/^"|"$/g, '').trim());
    }
    return [trimmed];
  }
  return [];
}

/** Map pg_constraint.confdeltype to SQL keyword */
function mapConfdeltype(code) {
  switch (String(code)) {
    case 'a':
      return 'NO ACTION';
    case 'r':
      return 'RESTRICT';
    case 'c':
      return 'CASCADE';
    case 'n':
      return 'SET NULL';
    case 'd':
      return 'SET DEFAULT';
    default:
      return String(code);
  }
}
