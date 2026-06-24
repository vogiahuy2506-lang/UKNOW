import { describe, it, expect, jest } from '@jest/globals';
import { runSingleMigration, stripOuterTransactionStatements } from '../migrationRunner.util.js';

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
