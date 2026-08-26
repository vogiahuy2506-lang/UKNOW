import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Quyết định hành vi migration khi tiến trình ứng dụng chính khởi động.
 *
 * Quy tắc:
 * 1. NODE_ENV=production: LUÔN là 'check' (check-only), bất kể SKIP_MIGRATIONS bị thiếu, false hay true.
 *    Nếu production thiếu SKIP_MIGRATIONS=true, trả về warning để cảnh báo nhưng vẫn ở chế độ check.
 * 2. Môi trường khác (development, test...):
 *    - SKIP_MIGRATIONS=true: 'check'
 *    - Ngược lại: 'run' (cho phép auto-run migration khi dev cục bộ)
 *
 * @param {{ nodeEnv?: string, skipMigrations?: string }} [options]
 * @returns {{ action: 'check' | 'run', isProduction: boolean, warning: string | null }}
 */
export function resolveStartupMigrationAction({
  nodeEnv = process.env.NODE_ENV,
  skipMigrations = process.env.SKIP_MIGRATIONS,
} = {}) {
  const isProduction = nodeEnv === 'production';
  const isSkipExplicit = String(skipMigrations).toLowerCase() === 'true';

  if (isProduction) {
    const warning = !isSkipExplicit
      ? '[Startup] Cảnh báo cấu hình: NODE_ENV=production nhưng thiếu SKIP_MIGRATIONS=true. '
        + 'Ứng dụng tự động kích hoạt chế độ check-only để đảm bảo an toàn (không tự chạy migration trong app runtime).'
      : null;
    return { action: 'check', isProduction: true, warning };
  }

  if (isSkipExplicit) {
    return { action: 'check', isProduction: false, warning: null };
  }

  return { action: 'run', isProduction: false, warning: null };
}

/**
 * Bỏ 1 `BEGIN;` đầu và 1 `COMMIT;` cuối (nếu có) để runner tự bọc transaction.
 * Dùng linear scanner thay vì regex lồng nhau để loại bỏ hoàn toàn nguy cơ Catastrophic Backtracking (ReDoS).
 * Tuyệt đối không xóa BEGIN/COMMIT bên trong function body hay DO $$ ... $$ block.
 *
 * @param {string} sql
 * @returns {string}
 */
export function stripOuterTransactionStatements(sql) {
  let body = String(sql || '').replace(/^\uFEFF/, '');
  if (!body.trim()) return body.trim();

  // 1. Quét tìm vị trí bắt đầu của code đầu tiên (bỏ qua whitespace, line comment, block comment)
  let firstCodeIdx = 0;
  const len = body.length;
  while (firstCodeIdx < len) {
    const ch = body[firstCodeIdx];
    if (/\s/.test(ch)) {
      firstCodeIdx++;
    } else if (ch === '-' && body[firstCodeIdx + 1] === '-') {
      // Line comment: nhảy đến hết dòng
      firstCodeIdx += 2;
      while (firstCodeIdx < len && body[firstCodeIdx] !== '\n' && body[firstCodeIdx] !== '\r') {
        firstCodeIdx++;
      }
    } else if (ch === '/' && body[firstCodeIdx + 1] === '*') {
      // Block comment: nhảy đến hết */
      firstCodeIdx += 2;
      while (firstCodeIdx < len && !(body[firstCodeIdx] === '*' && body[firstCodeIdx + 1] === '/')) {
        firstCodeIdx++;
      }
      if (firstCodeIdx < len) firstCodeIdx += 2;
    } else {
      break;
    }
  }

  const leadingPrefix = body.slice(0, firstCodeIdx);
  const afterLeading = body.slice(firstCodeIdx);

  // Khớp câu lệnh SQL đầu tiên bằng regex tuyến tính có neo ^
  const beginMatch = afterLeading.match(/^BEGIN(?:\s+(?:TRANSACTION|WORK))?\s*;/i);
  if (beginMatch) {
    body = leadingPrefix + afterLeading.slice(beginMatch[0].length);
  }

  // 2. Quét tuyến tính toàn chuỗi để tìm vị trí kết thúc của ký tự code cuối cùng (trước trailing comments/whitespace)
  let i = 0;
  const currentLen = body.length;
  let lastCodeEnd = 0;

  while (i < currentLen) {
    const ch = body[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '-' && body[i + 1] === '-') {
      i += 2;
      while (i < currentLen && body[i] !== '\n' && body[i] !== '\r') {
        i++;
      }
    } else if (ch === '/' && body[i + 1] === '*') {
      i += 2;
      while (i < currentLen && !(body[i] === '*' && body[i + 1] === '/')) {
        i++;
      }
      if (i < currentLen) i += 2;
    } else if (ch === "'" || ch === '"') {
      // String literal
      const quote = ch;
      i++;
      while (i < currentLen) {
        if (body[i] === quote) {
          i++;
          if (body[i] === quote) {
            i++;
          } else {
            break;
          }
        } else if (body[i] === '\\') {
          i += 2;
        } else {
          i++;
        }
      }
      lastCodeEnd = i;
    } else if (ch === '$' && /^\$[a-zA-Z0-9_]*\$/.test(body.slice(i, i + 64))) {
      // Dollar-quoted block (e.g. $$ or $func$)
      const tagMatch = body.slice(i, i + 64).match(/^\$[a-zA-Z0-9_]*\$/);
      const tag = tagMatch[0];
      i += tag.length;
      const closingIdx = body.indexOf(tag, i);
      if (closingIdx === -1) {
        i = currentLen;
      } else {
        i = closingIdx + tag.length;
      }
      lastCodeEnd = i;
    } else {
      i++;
      lastCodeEnd = i;
    }
  }

  const beforeTrailing = body.slice(0, lastCodeEnd);
  const trailingSuffix = body.slice(lastCodeEnd);

  // Kiểm tra câu lệnh SQL cuối cùng trong beforeTrailing có phải là COMMIT / COMMIT TRANSACTION / COMMIT WORK không
  const commitMatch = beforeTrailing.match(/(?:^|;)\s*COMMIT(?:\s+(?:TRANSACTION|WORK))?\s*;?\s*$/i);
  if (commitMatch) {
    const hasLeadingSemicolon = commitMatch[0].trimStart().startsWith(';');
    const replacement = hasLeadingSemicolon ? ';' : '';
    body = beforeTrailing.slice(0, commitMatch.index) + replacement + trailingSuffix;
  }

  return body.trim();
}

/**
 * Chạy một file migration trong transaction (all-or-nothing per file).
 *
 * @param {import('pg').PoolClient} client
 * @param {string} file
 * @param {string} sql
 */
export async function runSingleMigration(client, file, sql) {
  const migrationSql = stripOuterTransactionStatements(sql);
  await client.query('BEGIN');
  try {
    if (migrationSql) {
      await client.query(migrationSql);
    }
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      [file]
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error(`[Migration] ROLLBACK thất bại cho ${file}: ${rollbackErr.message}`);
    }
    throw err;
  }
}

/** Khoá advisory cho migration — session-scoped, KHÔNG dùng `_xact_` như các repo khác. */
const MIGRATION_LOCK_KEYS = ['schema:migrations', 'migration_runner'];

/** Danh sách file migration trên đĩa, đã sắp theo tên (001_, 002_, ...). */
export function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

/**
 * Đọc giá trị hiện tại của một GUC để khôi phục đúng sau khi đổi.
 *
 * KHÔNG dùng `RESET` được: pool truyền `statement_timeout` như tham số kết nối
 * ([database.js:74](../config/database.js)), nên `RESET` sẽ trả về mặc định của
 * server chứ không phải 30s của pool — client trả lại pool sẽ mất hạn mức và
 * một query lỗi có thể treo vô hạn.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} name
 * @returns {Promise<string>}
 */
async function readSetting(client, name) {
  const { rows } = await client.query(`SHOW ${name}`);
  return rows[0]?.[name] ?? '0';
}

/**
 * Chạy migration dưới khoá advisory + bảo vệ timeout an toàn.
 *
 * Vì sao cần khoá: hai tiến trình cùng chạy `runMigrations` sẽ cùng đọc
 * `schema_migrations` rỗng rồi cùng chạy một file → lỗi "column already exists"
 * hoặc chạy đôi phần UPDATE dữ liệu.
 *
 * Vì sao cần quản lý timeout trước khi lock:
 * Pool đặt `statement_timeout = 30s`. Nếu `lock_timeout = 60s`, lệnh chờ `pg_advisory_lock`
 * sẽ bị `statement_timeout` 30s cắt ngang trước khi chạm deadline chờ lock 60s.
 * Do đó ta tạm đặt `statement_timeout = 0` trước khi chờ lock, đặt `lock_timeout` theo cấu hình,
 * và sau khi có lock mới đặt `statement_timeout` cho khối công việc migration.
 * Toàn bộ setting luôn được theo dõi và khôi phục riêng rẽ trong `finally`.
 *
 * @param {import('pg').PoolClient} client
 * @param {() => Promise<any>} work
 */
export async function withMigrationLock(client, work) {
  const lockTimeoutMs = Number.parseInt(process.env.MIGRATION_LOCK_TIMEOUT_MS, 10) || 60_000;
  const statementTimeoutMs = Number.parseInt(process.env.MIGRATION_STATEMENT_TIMEOUT_MS, 10) || 0;

  const prevLockTimeout = await readSetting(client, 'lock_timeout');
  const prevStatementTimeout = await readSetting(client, 'statement_timeout');

  let locked = false;
  let statementTimeoutModified = false;
  let lockTimeoutModified = false;

  try {
    // 1. Tạm vô hiệu hóa statement_timeout để lệnh chờ lock không bị cắt ngang bởi pool 30s
    await client.query('SET statement_timeout = 0');
    statementTimeoutModified = true;

    // 2. Đặt lock_timeout deadline cho việc chờ lấy advisory lock
    await client.query(`SET lock_timeout = ${Number(lockTimeoutMs)}`);
    lockTimeoutModified = true;

    // 3. Chờ lấy advisory lock
    await client.query(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      MIGRATION_LOCK_KEYS
    );
    locked = true;

    // 4. Sau khi có lock, đặt statement_timeout cho work migration
    await client.query(`SET statement_timeout = ${Number(statementTimeoutMs)}`);
    return await work();
  } finally {
    // Luôn khôi phục riêng từng setting ngay khi setting đó đã từng bị sửa
    if (statementTimeoutModified) {
      try {
        await client.query(`SET statement_timeout = '${prevStatementTimeout}'`);
      } catch (err) {
        console.error(`[Migration] Không khôi phục được statement_timeout: ${err.message}`);
      }
    }
    if (lockTimeoutModified) {
      try {
        await client.query(`SET lock_timeout = '${prevLockTimeout}'`);
      } catch (err) {
        console.error(`[Migration] Không khôi phục được lock_timeout: ${err.message}`);
      }
    }

    if (locked) {
      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
          MIGRATION_LOCK_KEYS
        );
      } catch (err) {
        console.error(`[Migration] Không nhả được advisory lock: ${err.message}`);
      }
    }
  }
}

/**
 * Trả về danh sách file migration có trên đĩa nhưng chưa có trong `schema_migrations`.
 * Không ghi gì — dùng để kiểm tra ở nơi KHÔNG được phép chạy migration.
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<string[]>}
 */
export async function findPendingMigrations(client) {
  const { rows } = await client.query(
    `SELECT filename FROM schema_migrations`
  );
  const ran = new Set(rows.map(r => r.filename));
  return listMigrationFiles().filter(f => !ran.has(f));
}

/**
 * Chặn khởi động khi schema chưa được migrate.
 *
 * Dùng cho container app chạy với `SKIP_MIGRATIONS=true` (migration đã tách ra
 * bước riêng trong CI/CD). Không có hàm này thì bước migrate hỏng/bị bỏ sót sẽ
 * dẫn tới app chạy im lặng trên schema cũ — hỏng theo kiểu khó lần nhất.
 *
 * @param {import('pg').PoolClient} client
 */
export async function assertMigrationsUpToDate(client) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'schema_migrations' LIMIT 1`
  );
  if (rows.length === 0) {
    throw new Error(
      'schema_migrations chưa tồn tại — DB chưa được migrate lần nào. '
      + 'Chạy `npm run migrate` trước khi khởi động app.'
    );
  }

  const pending = await findPendingMigrations(client);
  if (pending.length > 0) {
    throw new Error(
      `Còn ${pending.length} migration chưa chạy: ${pending.join(', ')}. `
      + 'Chạy `npm run migrate` (hoặc bước migrate trong pipeline) trước khi khởi động app.'
    );
  }
  console.log(`[Migration] Schema up-to-date (${listMigrationFiles().length} migration đã chạy)`);
}

/**
 * Chạy tất cả các file SQL trong thư mục migrations/ theo thứ tự.
 * Lưu lịch sử vào bảng schema_migrations để không chạy lại file đã chạy.
 *
 * Baseline logic: nếu schema_migrations trống nhưng bảng users đã tồn tại
 * (tức là DB cũ dùng lazy migration), đánh dấu toàn bộ file hiện có là đã chạy
 * để tránh conflict khi chạy lại các migration không dùng IF NOT EXISTS.
 *
 * Toàn bộ thân hàm chạy dưới advisory lock — xem `withMigrationLock`.
 *
 * @param {import('pg').PoolClient} client
 */
export async function runMigrations(client) {
  return withMigrationLock(client, () => runMigrationsUnlocked(client));
}

/**
 * Thân thật của `runMigrations`, KHÔNG tự lấy khoá.
 * Tách ra để test được phần logic mà không cần giả lập advisory lock.
 *
 * @param {import('pg').PoolClient} client
 */
export async function runMigrationsUnlocked(client) {
  // Tạo bảng tracking nếu chưa có
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename  VARCHAR(255) PRIMARY KEY,
      ran_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows: ranRows } = await client.query('SELECT filename FROM schema_migrations');
  const ran = new Set(ranRows.map(r => r.filename));

  const files = listMigrationFiles(); // thứ tự theo tên: 001_, 002_, ...

  // Baseline: DB cũ đã có schema từ lazy migrations (001–009) — chỉ đánh dấu các
  // migration cũ là đã chạy, để các migration mới (010+) vẫn được thực thi bình thường.
  if (ran.size === 0) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`
    );
    if (rows.length > 0) {
      const legacyFiles = files.filter(f => {
        const num = parseInt(f.split('_')[0], 10);
        return num <= 9; // 001–009 đã được lazy migration trong index.js xử lý
      });
      for (const file of legacyFiles) {
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
          [file]
        );
        ran.add(file);
      }
      console.log(`[Migration] Baselined ${legacyFiles.length} legacy migration(s) — DB đã tồn tại từ trước`);
      // Không return — tiếp tục chạy các migration mới (010+) bên dưới
    }
  }

  let newCount = 0;
  for (const file of files) {
    if (ran.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[Migration] Đang chạy ${file}...`);
    try {
      await runSingleMigration(client, file, sql);
      console.log(`[Migration] ✓ ${file}`);
      newCount++;
    } catch (err) {
      console.error(`[Migration] ✗ ${file}: ${err.message}`);
      throw err;
    }
  }

  if (newCount === 0) {
    console.log('[Migration] Không có migration mới');
  } else {
    console.log(`[Migration] Đã chạy ${newCount} migration mới`);
  }
}
