import 'dotenv/config';
import db from './src/config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Check which migrations are actually in DB vs disk
  const { rows: dbMigrations } = await db.query(
    `SELECT filename, checksum_sha256, ran_at FROM schema_migrations ORDER BY ran_at`
  );
  console.log('DB migrations:');
  dbMigrations.forEach(r => console.log(' ', r.filename, r.checksum_sha256 ? '(has checksum)' : '(NO CHECKSUM)'));

  const diskFiles = fs.readdirSync(path.join(__dirname, 'migrations'))
    .filter(f => f.endsWith('.sql')).sort();

  // Find missing in DB (disk has but DB doesn't)
  const dbFilenames = new Set(dbMigrations.map(r => r.filename));
  const missing = diskFiles.filter(f => !dbFilenames.has(f));
  console.log('\nMissing from DB (need to run):', missing);

  // Mark 231 as already run (it failed AFTER constraint creation)
  const sql231 = fs.readFileSync(path.join(__dirname, 'migrations/231_facebook_channel_connections.sql'), 'utf8');
  const checksum231 = createHash('sha256').update(Buffer.from(sql231, 'utf8')).digest('hex');

  await db.query(
    `INSERT INTO schema_migrations (filename, checksum_sha256)
       VALUES ('231_facebook_channel_connections.sql', $1)
     ON CONFLICT (filename) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, ran_at = NOW()`,
    [checksum231]
  );
  console.log('\nMarked 231 as run with checksum:', checksum231);

  process.exit(0);
}

main();
