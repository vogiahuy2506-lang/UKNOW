import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/**
 * Bỏ 1 `BEGIN;` đầu và 1 `COMMIT;` cuối (nếu có) để runner tự bọc transaction.
 * Chỉ strip token đứng riêng — không đụng nội dung SQL bên trong.
 *
 * @param {string} sql
 * @returns {string}
 */
export function stripOuterTransactionStatements(sql) {
  let body = String(sql || '').trim();
  if (!body) return body;
  body = body.replace(/^\s*BEGIN\s*;\s*/i, '');
  body = body.replace(/\s*COMMIT\s*;\s*$/i, '');
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
 * Chạy migration dưới khoá advisory + bỏ trần statement_timeout.
 *
 * Vì sao cần khoá: hai tiến trình cùng chạy `runMigrations` sẽ cùng đọc
 * `schema_migrations` rỗng rồi cùng chạy một file → lỗi "column already exists"
 * hoặc tệ hơn là chạy đôi phần UPDATE dữ liệu. Hôm nay production chỉ có một
 * container nên chưa xảy ra, nhưng khoá là bảo hiểm vĩnh viễn, không phụ thuộc
 * vào việc người sau có nhớ luật một-container hay không.
 *
 * Vì sao bỏ trần timeout: pool đặt `statement_timeout = 30s`. Migration nặng
 * (UPDATE toàn bảng) sẽ bị Postgres huỷ giữa chừng → migration fail → app từ
 * chối khởi động. Trong phiên migration, trần được nâng theo
 * `MIGRATION_STATEMENT_TIMEOUT_MS` (mặc định 0 = không giới hạn).
 *
 * @param {import('pg').PoolClient} client
 * @param {() => Promise<any>} work
 */
export async function withMigrationLock(client, work) {
  const lockTimeoutMs = Number.parseInt(process.env.MIGRATION_LOCK_TIMEOUT_MS, 10) || 60_000;
  const statementTimeoutMs = Number.parseInt(process.env.MIGRATION_STATEMENT_TIMEOUT_MS, 10) || 0;

  const prevLockTimeout = await readSetting(client, 'lock_timeout');
  const prevStatementTimeout = await readSetting(client, 'statement_timeout');

  // lock_timeout áp cho chính lệnh chờ khoá bên dưới: nếu một tiến trình migration
  // khác treo, ta fail nhanh và thấy được lý do thay vì đứng im vô hạn.
  await client.query(`SET lock_timeout = ${Number(lockTimeoutMs)}`);

  let locked = false;
  try {
    await client.query(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      MIGRATION_LOCK_KEYS
    );
    locked = true;
    await client.query(`SET statement_timeout = ${Number(statementTimeoutMs)}`);
    return await work();
  } finally {
    // Khôi phục trước khi nhả khoá: client sẽ quay lại pool và được tái sử dụng.
    try {
      await client.query(`SET statement_timeout = '${prevStatementTimeout}'`);
      await client.query(`SET lock_timeout = '${prevLockTimeout}'`);
    } catch (err) {
      console.error(`[Migration] Không khôi phục được timeout: ${err.message}`);
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
