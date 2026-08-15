#!/usr/bin/env node
/**
 * Entrypoint chạy migration ĐỘC LẬP với app.
 *
 * Dùng trong pipeline deploy: chạy bước này TRƯỚC khi hạ container cũ. Migration
 * hỏng thì deploy dừng lại trong khi web vẫn phục vụ bằng bản cũ — thay vì hạ
 * container trước rồi mới phát hiện migration hỏng và không còn gì để phục vụ.
 *
 *   node scripts/migrate.js          # chạy migration
 *   node scripts/migrate.js --check  # chỉ kiểm tra, không ghi (exit 1 nếu còn pending)
 *
 * CỐ Ý chỉ import `database.js` + `migrationRunner.util.js`, KHÔNG import app:
 * kéo `index.js` vào sẽ khởi động scheduler, BullMQ worker và listener Zalo
 * trong một container lẽ ra chỉ sống vài giây.
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import {
  runMigrations,
  findPendingMigrations,
  listMigrationFiles,
} from '../src/utils/migrationRunner.util.js';

const checkOnly = process.argv.includes('--check');

async function main() {
  const client = await db.getClient();
  try {
    if (checkOnly) {
      const pending = await findPendingMigrations(client);
      if (pending.length > 0) {
        console.error(`[Migrate] Còn ${pending.length} migration chưa chạy:`);
        for (const file of pending) console.error(`  - ${file}`);
        process.exitCode = 1;
        return;
      }
      console.log(`[Migrate] Schema up-to-date (${listMigrationFiles().length} migration).`);
      return;
    }

    await runMigrations(client);
    console.log('[Migrate] Hoàn tất.');
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((error) => {
  console.error(`[Migrate] THẤT BẠI: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
