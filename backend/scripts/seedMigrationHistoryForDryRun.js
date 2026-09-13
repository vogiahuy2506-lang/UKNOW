#!/usr/bin/env node
/**
 * Gieo lịch sử schema_migrations cho job migration-dry-run trên CI.
 *
 * Nhận commit ref BASE (trước lần push này), gieo một dòng cho MỌI file migration
 * tồn tại ở BASE vào bảng schema_migrations. Checksum được tính bằng đúng
 * `hashMigrationContent` từ migrationRunner.util.js trên nội dung file ở HEAD.
 *
 * Nhờ đó, runner (scripts/migrate.js) coi các migration ở BASE là đã chạy, và chỉ
 * thi hành các migration mới thêm/sửa ở lần push này.
 *
 * Cách dùng:
 *   node scripts/seedMigrationHistoryForDryRun.js <BASE>
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import db from '../src/config/database.js';
import {
  listMigrationFiles,
  hashMigrationContent,
} from '../src/utils/migrationRunner.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

const baseRef = process.argv[2];
if (!baseRef) {
  console.error('[SeedMigrationHistory] Lỗi: Thiếu đối số BASE commit ref.');
  console.error('Cách dùng: node scripts/seedMigrationHistoryForDryRun.js <BASE>');
  process.exit(1);
}

async function main() {
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const baseOutput = execSync(
    `git -C "${gitRoot}" ls-tree --name-only "${baseRef}" -- backend/migrations/`,
    { encoding: 'utf8' }
  );

  const baseFiles = new Set(
    baseOutput
      .split('\n')
      .map((line) => path.basename(line.trim()))
      .filter((name) => name.endsWith('.sql'))
  );

  const allDiskFiles = listMigrationFiles();
  const filesToSeed = allDiskFiles.filter((file) => baseFiles.has(file));

  const client = await db.getClient();
  try {
    let count = 0;
    for (const file of filesToSeed) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const content = fs.readFileSync(filePath);
      const checksum = hashMigrationContent(content);

      await client.query(
        `INSERT INTO schema_migrations (filename, checksum_sha256, ran_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (filename) DO UPDATE
           SET checksum_sha256 = EXCLUDED.checksum_sha256,
               ran_at = EXCLUDED.ran_at`,
        [file, checksum]
      );
      count++;
    }

    console.log(`[SeedMigrationHistory] Đã gieo ${count} file migration từ BASE (${baseRef}).`);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((err) => {
  console.error(`[SeedMigrationHistory] THẤT BẠI: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
