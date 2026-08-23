#!/usr/bin/env node
/**
 * Dò những cột mà migration thêm bằng ALTER TABLE nhưng schema test lại thiếu.
 *
 * VÌ SAO CẦN: `tests/integration/sql/bootstrap.sql` dựng bảng theo hình dạng BAN
 * ĐẦU của chúng. Cột thêm sau bằng `ALTER TABLE ... ADD COLUMN` ở migration thì
 * không có. Bảng vẫn tồn tại nên đếm bảng thấy đủ, mà truy vấn thì vỡ.
 *
 * Đã gặp thật (23/08/2026): hộp thư trả 500 `column wm.is_read does not exist`
 * dù `webchat_messages` có sẵn trong bootstrap.sql — cột `is_read` do migration
 * 032 thêm vào. Lần đó dò ra 13 cột thiếu cùng loại.
 *
 * Chạy sau mỗi lần thêm cột mới cho bảng cũ, hoặc khi một trang bỗng trả 500 với
 * thông báo "column ... does not exist".
 *
 *   DB_PORT=5434 node scripts/checkBootstrapColumns.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

/** Mọi cặp (bảng, cột) mà migration thêm bằng ALTER TABLE. */
function columnsAddedByMigrations() {
  const wanted = new Map();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Một câu ALTER có thể thêm nhiều cột: "ADD COLUMN a ..., ADD COLUMN b ..."
    const statements = sql.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?[a-z_]+[\s\S]*?;/gi) || [];
    for (const statement of statements) {
      const table = statement.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_]+)/i)?.[1];
      if (!table) continue;
      const columns = statement.match(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi) || [];
      for (const raw of columns) {
        const column = raw.match(/([a-z_]+)$/i)?.[1];
        if (column) wanted.set(`${table}.${column}`, file);
      }
    }
  }
  return wanted;
}

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5433,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'uknow_campaign_test',
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const tables = new Set(rows.map((r) => r.table_name));

    const wanted = columnsAddedByMigrations();
    const missing = [];
    const missingTables = new Set();

    for (const [key, file] of wanted) {
      if (have.has(key)) continue;
      const table = key.split('.')[0];
      // Bảng không tồn tại là chuyện khác (thiếu cả CREATE TABLE) — gom riêng để
      // không lẫn với đúng thứ script này đi tìm.
      if (!tables.has(table)) { missingTables.add(table); continue; }
      missing.push({ key, file });
    }

    console.log(`Đã quét ${wanted.size} cột do migration thêm bằng ALTER TABLE.\n`);

    if (missingTables.size) {
      console.log(`${missingTables.size} bảng chưa có trong schema test (thiếu cả CREATE TABLE):`);
      console.log(`  ${[...missingTables].sort().join(', ')}\n`);
    }

    if (!missing.length) {
      console.log('✓ Không cột nào thiếu.');
      return;
    }

    console.log(`✗ ${missing.length} cột THIẾU — bảng có nhưng cột chưa có:`);
    for (const { key, file } of missing) console.log(`  ${key.padEnd(46)} ← ${file}`);
    console.log('\nThêm câu ALTER tương ứng vào tests/integration/sql/bootstrap.sql,');
    console.log('chép nguyên từ file migration nguồn.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[checkBootstrapColumns] ${error.message}`);
  process.exitCode = 1;
});
