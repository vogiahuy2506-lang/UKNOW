import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, jest } from '@jest/globals';
import {
  runSingleMigration,
  hashMigrationContent,
  stripOuterTransactionStatements,
  withMigrationLock,
  assertMigrationsUpToDate,
  listMigrationFiles,
  runMigrationsUnlocked,
  resolveStartupMigrationAction,
} from '../migrationRunner.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

describe('resolveStartupMigrationAction', () => {
  it('production luôn là check-only kể cả khi SKIP_MIGRATIONS bị thiếu hoặc false', () => {
    // Thiếu SKIP_MIGRATIONS -> check kèm warning
    const missing = resolveStartupMigrationAction({ nodeEnv: 'production', skipMigrations: undefined });
    expect(missing.action).toBe('check');
    expect(missing.isProduction).toBe(true);
    expect(missing.warning).toMatch(/Cảnh báo cấu hình: NODE_ENV=production nhưng thiếu SKIP_MIGRATIONS=true/);

    // SKIP_MIGRATIONS=false -> check kèm warning
    const falseVal = resolveStartupMigrationAction({ nodeEnv: 'production', skipMigrations: 'false' });
    expect(falseVal.action).toBe('check');
    expect(falseVal.isProduction).toBe(true);
    expect(falseVal.warning).toMatch(/Cảnh báo cấu hình/);

    // SKIP_MIGRATIONS=true -> check không warning
    const trueVal = resolveStartupMigrationAction({ nodeEnv: 'production', skipMigrations: 'true' });
    expect(trueVal.action).toBe('check');
    expect(trueVal.isProduction).toBe(true);
    expect(trueVal.warning).toBeNull();
  });

  it('development auto-run khi không skip, và check-only khi có SKIP_MIGRATIONS=true', () => {
    // Mặc định dev -> run
    const devDefault = resolveStartupMigrationAction({ nodeEnv: 'development', skipMigrations: undefined });
    expect(devDefault.action).toBe('run');
    expect(devDefault.isProduction).toBe(false);
    expect(devDefault.warning).toBeNull();

    // Dev với SKIP_MIGRATIONS=true -> check
    const devSkip = resolveStartupMigrationAction({ nodeEnv: 'development', skipMigrations: 'true' });
    expect(devSkip.action).toBe('check');
    expect(devSkip.isProduction).toBe(false);
    expect(devSkip.warning).toBeNull();
  });

  it('test/e2e môi trường khác tuân theo cờ SKIP_MIGRATIONS', () => {
    const testSkip = resolveStartupMigrationAction({ nodeEnv: 'test', skipMigrations: 'true' });
    expect(testSkip.action).toBe('check');

    const testRun = resolveStartupMigrationAction({ nodeEnv: 'test', skipMigrations: 'false' });
    expect(testRun.action).toBe('run');
  });
});

describe('stripOuterTransactionStatements', () => {
  it('bỏ BEGIN; đầu và COMMIT; cuối đơn giản', () => {
    const sql = `BEGIN;
CREATE TABLE foo (id int);
COMMIT;`;
    expect(stripOuterTransactionStatements(sql)).toBe('CREATE TABLE foo (id int);');
  });

  it('giữ nguyên SQL không tự-wrap', () => {
    const sql = 'ALTER TABLE users ADD COLUMN x int;';
    expect(stripOuterTransactionStatements(sql)).toBe(sql);
  });

  it('bỏ BEGIN/COMMIT khi có comment tiếng Việt và line comment ở đầu/cuối', () => {
    const sql = `-- Migration tạo bảng sản phẩm
-- Tác giả: UKNOW Dev
BEGIN;
CREATE TABLE products (id serial primary key);
COMMIT;
-- Kết thúc migration`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).not.toMatch(/^BEGIN;/m);
    expect(result).not.toMatch(/^COMMIT;/m);
    expect(result).toContain('CREATE TABLE products (id serial primary key);');
    expect(result).toContain('-- Migration tạo bảng sản phẩm');
    expect(result).toContain('-- Kết thúc migration');
  });

  it('bỏ BEGIN TRANSACTION / COMMIT WORK khi có block comment', () => {
    const sql = `/*
 * Block comment mô tả migration
 */
BEGIN TRANSACTION;
ALTER TABLE orders ADD COLUMN status text;
COMMIT WORK;
/* End of file */`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).not.toContain('BEGIN TRANSACTION;');
    expect(result).not.toContain('COMMIT WORK;');
    expect(result).toContain('ALTER TABLE orders ADD COLUMN status text;');
    expect(result).toContain('Block comment mô tả migration');
    expect(result).toContain('/* End of file */');
  });

  it('xử lý an toàn file có UTF-8 BOM', () => {
    const sql = `\uFEFF-- Migration with BOM
BEGIN;
SELECT 1;
COMMIT;`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).not.toContain('\uFEFF');
    expect(result).toContain('SELECT 1;');
    expect(result).not.toMatch(/^BEGIN;/m);
  });

  it('KHÔNG xóa BEGIN trong DO $$ BEGIN ... END $$ block', () => {
    const sql = `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'user');
  END IF;
END $$;`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).toBe(sql);
  });

  it('KHÔNG xóa BEGIN trong CREATE FUNCTION', () => {
    const sql = `CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).toBe(sql);
  });

  it('bóc đúng outer BEGIN khi bên trong có chứa DO $$ BEGIN ... END $$', () => {
    const sql = `-- Outer wrap
BEGIN;
DO $$
BEGIN
  NULL;
END $$;
COMMIT;`;

    const result = stripOuterTransactionStatements(sql);
    expect(result).toContain('DO $$');
    expect(result).toContain('BEGIN');
    expect(result).toContain('END $$;');
    expect(result).not.toMatch(/^BEGIN;/m);
    expect(result).not.toMatch(/^COMMIT;/m);
  });

  it('xử lý 047_diagnostic_runs.sql tức thì, không bị ReDoS / backtracking', () => {
    const filePath = path.join(MIGRATIONS_DIR, '047_diagnostic_runs.sql');
    const content = fs.readFileSync(filePath, 'utf8');
    const start = Date.now();
    const result = stripOuterTransactionStatements(content);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50); // Phải dưới 50ms
    expect(result).toContain('CREATE TABLE diagnostic_runs');
    expect(result).toContain('CREATE INDEX idx_diagnostic_messages_run');
  });

  it('scan toàn bộ 190 migrations thực tế: chạy nhanh (<200ms) và bóc sạch wrapper khỏi các file có BEGIN/COMMIT', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(190);

    const fileContents = files.map((file) => ({
      file,
      content: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    }));

    const startTime = Date.now();
    let strippedWrappedFilesCount = 0;

    for (const { content } of fileContents) {
      const stripped = stripOuterTransactionStatements(content);
      expect(typeof stripped).toBe('string');
      if (content.trim().length > 0) {
        expect(stripped.length).toBeGreaterThan(0);
      }

      // Xác minh stripped không còn bắt đầu bằng BEGIN; ngoài cùng
      const cleanStart = stripped.replace(/^(?:\s+|--[^\r\n]*|\/\*[\s\S]*?\*\/)*/, '').trim();
      expect(cleanStart.startsWith('BEGIN;')).toBe(false);
      expect(cleanStart.startsWith('BEGIN TRANSACTION;')).toBe(false);
      expect(cleanStart.startsWith('BEGIN WORK;')).toBe(false);

      if (content.includes('BEGIN;') && !stripped.includes('BEGIN;')) {
        strippedWrappedFilesCount++;
      }
    }

    const elapsed = Date.now() - startTime;
    // 190 file xử lý trong bộ nhớ phải cực nhanh (thường < 30ms, đặt ngưỡng 500ms chống flaky khi CI tải cao)
    expect(elapsed).toBeLessThan(500);
    expect(strippedWrappedFilesCount).toBeGreaterThanOrEqual(50);

    // Kiểm tra cụ thể các file có outer wrapper điển hình
    const wrappedSamples = [
      '002_users_active_plan.sql',
      '010_pgvector_business_profiles.sql',
      '134_chatbot_reply_limit_config.sql',
      '163_trial_duration_14_days.sql',
    ];

    for (const sample of wrappedSamples) {
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, sample), 'utf8');
      const processed = stripOuterTransactionStatements(raw);

      // Raw phải có outer BEGIN;
      expect(raw).toMatch(/BEGIN;/);
      // Processed phải bóc sạch outer BEGIN; và COMMIT;
      expect(processed).not.toMatch(/^BEGIN;/m);
      expect(processed).not.toMatch(/COMMIT;\s*$/);
      // Nhưng giữ nguyên nội dung DDL
      expect(processed.length).toBeGreaterThan(10);
    }
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
      "INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
      'COMMIT',
    ]);
    expect(client.query.mock.calls[2][1]).toEqual(['099_test.sql', hashMigrationContent('SELECT 1')]);
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
      "INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
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

describe('checksum baseline', () => {
  it('hashes exact bytes, including CRLF', () => {
    const crlf = Buffer.from('SELECT 1;\r\n', 'utf8');
    const lf = Buffer.from('SELECT 1;\n', 'utf8');

    expect(hashMigrationContent(crlf)).not.toBe(hashMigrationContent(lf));
    expect(hashMigrationContent(crlf)).toBe(hashMigrationContent(Buffer.from(crlf)));
  });

  it('baselines a legacy NULL checksum once, then does not rewrite it', async () => {
    const files = listMigrationFiles();
    const target = files[0];
    const checksummedRows = files.map((filename) => ({
      filename,
      checksum_sha256: hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, filename))),
    }));
    const legacyRows = checksummedRows.map((row) => (
      row.filename === target ? { ...row, checksum_sha256: null } : row
    ));
    let historyReads = 0;
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT filename, checksum_sha256 FROM schema_migrations')) {
          historyReads += 1;
          return { rows: historyReads === 1 ? legacyRows : checksummedRows };
        }
        return { rows: [] };
      }),
    };

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runMigrationsUnlocked(client);
      await runMigrationsUnlocked(client);
      expect(logSpy).toHaveBeenCalledWith('[Migration] Đã baseline checksum cho 1 migration lịch sử');
    } finally {
      logSpy.mockRestore();
    }

    const baselineUpdates = client.query.mock.calls.filter(([sql]) => (
      String(sql).includes('SET checksum_sha256 = $2')
    ));
    expect(baselineUpdates).toHaveLength(1);
    expect(baselineUpdates[0][1]).toEqual([
      target,
      hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, target))),
    ]);
  });

  it('stops after a legacy checksum baseline when the same invocation has pending migrations', async () => {
    const files = listMigrationFiles();
    const pendingFile = files.at(-1);
    const baselineFile = files[0];
    const checksummedRows = files
      .filter((filename) => filename !== pendingFile)
      .map((filename) => ({
        filename,
        checksum_sha256: hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, filename))),
      }));
    const legacyRows = checksummedRows.map((row) => (
      row.filename === baselineFile ? { ...row, checksum_sha256: null } : row
    ));
    let historyReads = 0;
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT filename, checksum_sha256 FROM schema_migrations')) {
          historyReads += 1;
          return { rows: historyReads === 1 ? legacyRows : checksummedRows };
        }
        return { rows: [] };
      }),
    };

    const previousBuildSha = process.env.BUILD_SHA;
    process.env.BUILD_SHA = 'checksum-checkpoint-c';
    try {
      await expect(runMigrationsUnlocked(client))
        .rejects.toThrow(/migration pending.*Dừng tại checkpoint checksum/);
    } finally {
      if (previousBuildSha === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = previousBuildSha;
    }

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET checksum_sha256 = $2'),
      [baselineFile, hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, baselineFile)))],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO migration_runner_checkpoints'),
      ['checksum_baseline_with_pending', 'checksum-checkpoint-c']
    );
    const calls = client.query.mock.calls.map(([sql]) => String(sql).trim());
    const beginIndex = calls.indexOf('BEGIN');
    const checksumUpdateIndex = calls.findIndex((sql) => sql.includes('SET checksum_sha256 = $2'));
    const checkpointIndex = calls.findIndex((sql) => sql.includes('INSERT INTO migration_runner_checkpoints'));
    const commitIndex = calls.indexOf('COMMIT');
    expect(beginIndex).toBeGreaterThan(-1);
    expect(checksumUpdateIndex).toBeGreaterThan(beginIndex);
    expect(checkpointIndex).toBeGreaterThan(checksumUpdateIndex);
    expect(commitIndex).toBeGreaterThan(checkpointIndex);
  });

  it('rolls back checksum baseline when recording the release checkpoint fails, so a retry cannot cross the boundary', async () => {
    const files = listMigrationFiles();
    // Keep this checkpoint test independent from a particular business
    // migration. The checksum-only release intentionally has no 174 file.
    const pendingFile = files.at(-1);
    const baselineFile = files.find((filename) => filename !== pendingFile);
    const committedRows = files
      .filter((filename) => filename !== pendingFile)
      .map((filename) => ({
        filename,
        checksum_sha256: filename === baselineFile
          ? null
          : hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, filename))),
      }));
    let committedCheckpoint = null;
    let workingRows = null;
    let workingCheckpoint = null;
    let failCheckpointInsert = true;

    const cloneRows = (rows) => rows.map((row) => ({ ...row }));
    const client = {
      query: jest.fn(async (sql, params = []) => {
        const text = String(sql).trim();
        if (text === 'BEGIN') {
          workingRows = cloneRows(committedRows);
          workingCheckpoint = committedCheckpoint;
          return { rows: [] };
        }
        if (text === 'COMMIT') {
          committedRows.splice(0, committedRows.length, ...cloneRows(workingRows));
          committedCheckpoint = workingCheckpoint;
          workingRows = null;
          workingCheckpoint = null;
          return { rows: [] };
        }
        if (text === 'ROLLBACK') {
          workingRows = null;
          workingCheckpoint = null;
          return { rows: [] };
        }
        if (text.includes('SELECT filename, checksum_sha256 FROM schema_migrations')) {
          return { rows: cloneRows(workingRows || committedRows) };
        }
        if (text.includes('SELECT release_id') && text.includes('migration_runner_checkpoints')) {
          return { rows: committedCheckpoint ? [{ release_id: committedCheckpoint }] : [] };
        }
        if (text.includes('SET checksum_sha256 = $2')) {
          const row = (workingRows || committedRows).find((item) => item.filename === params[0]);
          row.checksum_sha256 = params[1];
          return { rows: [] };
        }
        if (text.includes('INSERT INTO migration_runner_checkpoints')) {
          if (failCheckpointInsert) throw new Error('checkpoint write failed');
          workingCheckpoint = params[1];
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const previousBuildSha = process.env.BUILD_SHA;
    process.env.BUILD_SHA = 'checksum-checkpoint-c';
    try {
      await expect(runMigrationsUnlocked(client)).rejects.toThrow('checkpoint write failed');
      expect(committedRows.find((row) => row.filename === baselineFile).checksum_sha256).toBeNull();
      expect(committedCheckpoint).toBeNull();

      failCheckpointInsert = false;
      await expect(runMigrationsUnlocked(client))
        .rejects.toThrow(/Dừng tại checkpoint checksum/);
    } finally {
      if (previousBuildSha === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = previousBuildSha;
    }

    expect(committedRows.find((row) => row.filename === baselineFile).checksum_sha256)
      .toBe(hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, baselineFile))));
    expect(committedCheckpoint).toBe('checksum-checkpoint-c');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => (
      String(sql).includes('INSERT INTO schema_migrations (filename, checksum_sha256)')
    ))).toBe(false);
  });

  it('refuses a same-artifact retry after checksum checkpoint, then lets a later release run the pending migration', async () => {
    const files = listMigrationFiles();
    // The simulated pending file must exist in every checksum-only release.
    const pendingFile = files.at(-1);
    const migratedRows = files
      .filter((filename) => filename !== pendingFile)
      .map((filename) => ({
        filename,
        checksum_sha256: hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, filename))),
      }));
    const queries = [];
    const client = {
      query: jest.fn(async (sql, params = []) => {
        const text = String(sql);
        queries.push({ text, params });
        if (text.includes('SELECT filename, checksum_sha256 FROM schema_migrations')) {
          return { rows: migratedRows };
        }
        if (text.includes('SELECT release_id') && text.includes('migration_runner_checkpoints')) {
          return { rows: [{ release_id: 'checksum-checkpoint-c' }] };
        }
        return { rows: [] };
      }),
    };

    const previousBuildSha = process.env.BUILD_SHA;
    try {
      process.env.BUILD_SHA = 'checksum-checkpoint-c';
      await expect(runMigrationsUnlocked(client))
        .rejects.toThrow(/retry cùng artifact/);
      expect(queries.some(({ text }) => text === 'BEGIN')).toBe(false);

      process.env.BUILD_SHA = 'billing-repair-e';
      await expect(runMigrationsUnlocked(client)).resolves.toBeUndefined();
    } finally {
      if (previousBuildSha === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = previousBuildSha;
    }

    expect(queries.some(({ text }) => text === 'BEGIN')).toBe(true);
    expect(queries).toContainEqual(expect.objectContaining({
      text: expect.stringContaining('INSERT INTO schema_migrations (filename, checksum_sha256)'),
      params: [pendingFile, hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, pendingFile)))],
    }));
    expect(queries).toContainEqual(expect.objectContaining({
      text: expect.stringContaining('DELETE FROM migration_runner_checkpoints'),
      params: ['checksum_baseline_with_pending'],
    }));
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

  it('tạm đặt statement_timeout=0 TRƯỚC khi chờ lock, đặt lock_timeout, lấy lock rồi mới đặt statement_timeout công việc', async () => {
    const queries = [];
    const client = makeClient(queries);

    await withMigrationLock(client, async () => 'done');

    // Thứ tự câu lệnh chuẩn
    expect(queries[0]).toBe('SHOW lock_timeout');
    expect(queries[1]).toBe('SHOW statement_timeout');
    expect(queries[2]).toBe('SET statement_timeout = 0');
    expect(queries[3]).toBe('SET lock_timeout = 60000');
    expect(queries[4]).toBe('SELECT pg_advisory_lock(hashtext($1), hashtext($2))');
    expect(queries[5]).toBe('SET statement_timeout = 0');
    // Khôi phục đúng giá trị cũ của pool trong finally, KHÔNG dùng RESET
    expect(queries).toContain("SET statement_timeout = '30s'");
    expect(queries).toContain("SET lock_timeout = '5s'");
    expect(queries).toContain('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))');
  });

  it('vẫn nhả khoá và khôi phục timeout khi migration ném lỗi', async () => {
    const queries = [];
    const client = makeClient(queries);

    await expect(
      withMigrationLock(client, async () => { throw new Error('migration hỏng'); })
    ).rejects.toThrow('migration hỏng');

    expect(queries).toContain('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))');
    expect(queries).toContain("SET statement_timeout = '30s'");
    expect(queries).toContain("SET lock_timeout = '5s'");
  });

  it('phục hồi riêng statement_timeout ngay cả khi câu SET lock_timeout tiếp theo bị lỗi', async () => {
    const queries = [];
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql).trim();
        queries.push(text);
        if (text === 'SHOW lock_timeout') return { rows: [{ lock_timeout: '5s' }] };
        if (text === 'SHOW statement_timeout') return { rows: [{ statement_timeout: '30s' }] };
        if (text.startsWith('SET lock_timeout')) throw new Error('SET lock_timeout failed');
        return { rows: [] };
      }),
    };

    await expect(withMigrationLock(client, async () => 'ok')).rejects.toThrow('SET lock_timeout failed');
    // statement_timeout đã đổi thành 0 phải được phục hồi về 30s
    expect(queries).toContain("SET statement_timeout = '30s'");
    // Không cố nhả lock khi chưa lấy lock
    expect(queries.filter((q) => q.includes('pg_advisory_unlock'))).toHaveLength(0);
  });

  it('không nhả khoá nếu chưa lấy được khoá nhưng vẫn khôi phục timeout', async () => {
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
    // Vẫn khôi phục settings ban đầu
    expect(queries).toContain("SET statement_timeout = '30s'");
    expect(queries).toContain("SET lock_timeout = '5s'");
  });
});

describe('assertMigrationsUpToDate', () => {
  it('ném lỗi liệt kê file còn thiếu khi schema chưa migrate đủ', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('information_schema.columns')) return { rows: [{ '?column?': 1 }] };
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

  it('check-only không tự ALTER tracker cũ thiếu cột checksum', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('information_schema.columns')) return { rows: [] };
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).rejects.toThrow(/thiếu cột checksum_sha256/);
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('ALTER TABLE'))).toBe(false);
  });

  it('đi qua khi mọi migration trên đĩa đều đã chạy', async () => {
    const files = listMigrationFiles();
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('information_schema.columns')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('FROM schema_migrations')) {
          return {
            rows: files.map((filename) => ({
              filename,
              checksum_sha256: hashMigrationContent(
                fs.readFileSync(path.join(MIGRATIONS_DIR, filename))
              ),
            })),
          };
        }
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).resolves.toBeUndefined();
  });

  it('chặn khi checksum của migration đã chạy bị thay đổi', async () => {
    const files = listMigrationFiles();
    const target = files[0];
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('information_schema.columns')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('FROM schema_migrations')) {
          return {
            rows: files.map((filename) => ({
              filename,
              checksum_sha256: filename === target ? '0'.repeat(64) : hashMigrationContent(
                fs.readFileSync(path.join(MIGRATIONS_DIR, filename))
              ),
            })),
          };
        }
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).rejects.toThrow(/checksum không khớp/);
  });

  it('chặn check-only khi lịch sử cũ còn checksum NULL để buộc baseline có kiểm soát', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('information_schema.columns')) return { rows: [{ '?column?': 1 }] };
        if (text.includes('FROM schema_migrations')) {
          return { rows: [{ filename: listMigrationFiles()[0], checksum_sha256: null }] };
        }
        return { rows: [] };
      }),
    };

    await expect(assertMigrationsUpToDate(client)).rejects.toThrow(/checksum NULL/);
  });
});
