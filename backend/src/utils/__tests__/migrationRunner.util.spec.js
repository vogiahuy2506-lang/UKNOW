import { describe, it, expect, jest } from '@jest/globals';
import {
  runSingleMigration,
  stripOuterTransactionStatements,
  withMigrationLock,
  assertMigrationsUpToDate,
  listMigrationFiles,
} from '../migrationRunner.util.js';

describe('stripOuterTransactionStatements', () => {
  it('bỏ BEGIN; đầu và COMMIT; cuối', () => {
    const sql = `BEGIN;
CREATE TABLE foo (id int);
COMMIT;`;
    expect(stripOuterTransactionStatements(sql)).toBe('CREATE TABLE foo (id int);');
  });

  it('giữ nguyên SQL không tự-wrap', () => {
    const sql = 'ALTER TABLE users ADD COLUMN x int;';
    expect(stripOuterTransactionStatements(sql)).toBe(sql);
  });
});

describe('runSingleMigration', () => {
  it('COMMIT khi migration thành công', async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        queries.push(String(sql).trim());
        return { rows: [] };
      }),
    };

    await runSingleMigration(client, '099_test.sql', 'SELECT 1');

    expect(queries).toEqual([
      'BEGIN',
      'SELECT 1',
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      'COMMIT',
    ]);
  });

  it('strip BEGIN/COMMIT nội bộ rồi chạy trong tx runner', async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        queries.push(String(sql).trim());
        return { rows: [] };
      }),
    };

    await runSingleMigration(client, '010_wrap.sql', 'BEGIN;\nSELECT 2;\nCOMMIT;');

    expect(queries).toEqual([
      'BEGIN',
      'SELECT 2;',
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      'COMMIT',
    ]);
    expect(queries).not.toContain('BEGIN;');
  });

  it('ROLLBACK khi migration lỗi, không ghi schema_migrations', async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        const normalized = String(sql).trim();
        queries.push(normalized);
        if (normalized === 'FAIL') {
          throw new Error('statement failed');
        }
        return { rows: [] };
      }),
    };

    await expect(runSingleMigration(client, '099_fail.sql', 'FAIL')).rejects.toThrow('statement failed');

    expect(queries).toEqual(['BEGIN', 'FAIL', 'ROLLBACK']);
    expect(queries).not.toContain('COMMIT');
  });
});

describe('withMigrationLock', () => {
  const makeClient = (queries) => ({
    query: jest.fn(async (sql) => {
      const text = String(sql).trim();
      queries.push(text);
      if (text === 'SHOW lock_timeout') return { rows: [{ lock_timeout: '5s' }] };
      if (text === 'SHOW statement_timeout') return { rows: [{ statement_timeout: '30s' }] };
      return { rows: [] };
    }),
  });

  it('lấy advisory lock, bỏ trần statement_timeout, rồi khôi phục + nhả khoá', async () => {
    const queries = [];
    const client = makeClient(queries);

    await withMigrationLock(client, async () => 'done');

    expect(queries).toContain('SELECT pg_advisory_lock(hashtext($1), hashtext($2))');
    expect(queries).toContain('SET statement_timeout = 0');
    // Khôi phục đúng giá trị cũ của pool, KHÔNG dùng RESET (sẽ về default server)
    expect(queries).toContain("SET statement_timeout = '30s'");
    expect(queries).toContain("SET lock_timeout = '5s'");
    expect(queries).toContain('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))');
    expect(queries).not.toContain('RESET statement_timeout');
  });

  it('vẫn nhả khoá và khôi phục timeout khi migration ném lỗi', async () => {
    const queries = [];
    const client = makeClient(queries);

    await expect(
      withMigrationLock(client, async () => { throw new Error('migration hỏng'); })
    ).rejects.toThrow('migration hỏng');

    expect(queries).toContain('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))');
    expect(queries).toContain("SET statement_timeout = '30s'");
  });

  it('không nhả khoá nếu chưa lấy được khoá', async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql).trim();
        queries.push(text);
        if (text === 'SHOW lock_timeout') return { rows: [{ lock_timeout: '5s' }] };
        if (text === 'SHOW statement_timeout') return { rows: [{ statement_timeout: '30s' }] };
        if (text.includes('pg_advisory_lock')) throw new Error('canceling statement due to lock timeout');
        return { rows: [] };
      }),
    };

    await expect(withMigrationLock(client, async () => 'x')).rejects.toThrow(/lock timeout/);
    expect(queries.filter((q) => q.includes('pg_advisory_unlock'))).toHaveLength(0);
  });
});

describe('assertMigrationsUpToDate', () => {
  it('ném lỗi liệt kê file còn thiếu khi schema chưa migrate đủ', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('FROM schema_migrations')) return { rows: [] };
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).rejects.toThrow(/migration chưa chạy/);
  });

  it('ném lỗi rõ nghĩa khi bảng schema_migrations chưa tồn tại', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('information_schema.tables')) return { rows: [] };
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).rejects.toThrow(/chưa được migrate lần nào/);
  });

  it('đi qua khi mọi migration trên đĩa đều đã chạy', async () => {
    const files = listMigrationFiles();
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('FROM schema_migrations')) {
          return { rows: files.map((filename) => ({ filename })) };
        }
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).resolves.toBeUndefined();
  });
});
