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

/**
 * Chạy tất cả các file SQL trong thư mục migrations/ theo thứ tự.
 * Lưu lịch sử vào bảng schema_migrations để không chạy lại file đã chạy.
 *
 * Baseline logic: nếu schema_migrations trống nhưng bảng users đã tồn tại
 * (tức là DB cũ dùng lazy migration), đánh dấu toàn bộ file hiện có là đã chạy
 * để tránh conflict khi chạy lại các migration không dùng IF NOT EXISTS.
 *
 * @param {import('pg').PoolClient} client
 */
export async function runMigrations(client) {
  // Tạo bảng tracking nếu chưa có
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename  VARCHAR(255) PRIMARY KEY,
      ran_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows: ranRows } = await client.query('SELECT filename FROM schema_migrations');
  const ran = new Set(ranRows.map(r => r.filename));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // thứ tự theo tên: 001_, 002_, ...

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
