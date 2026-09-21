import 'dotenv/config';
import db from './src/config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Mark migration 232 as already run (no-op since rows already deleted).
  const checksum = createHash('sha256')
    .update(Buffer.from(fs.readFileSync(
      path.join(__dirname, 'migrations/232_cleanup_orphan_facebook_migrations.sql'), 'utf8'
    ), 'utf8'))
    .digest('hex');

  const { rows } = await db.query(
    `INSERT INTO schema_migrations (filename, checksum_sha256)
       VALUES ('232_cleanup_orphan_facebook_migrations.sql', $1)
     ON CONFLICT (filename) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, ran_at = NOW()
     RETURNING filename`,
    [checksum]
  );
  console.log('Marked as ran:', rows);

  // 2. Show what's still pending after 232.
  const { rows: pending } = await db.query(`
    SELECT filename FROM schema_migrations WHERE filename > '232_cleanup_orphan_facebook_migrations.sql'
    ORDER BY filename
  `);
  console.log('Pending in DB after 232:', pending.map(r => r.filename));

  // 3. Show files on disk after 232.
  const files = fs.readdirSync(path.join(__dirname, 'migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort();
  const after232 = files.filter(f => f > '232_cleanup_orphan_facebook_migrations.sql');
  console.log('Files on disk after 232:', after232);

  process.exit(0);
}

main();
