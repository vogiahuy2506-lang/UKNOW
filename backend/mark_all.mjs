import 'dotenv/config';
import db from './src/config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Only mark 231 as run (it was already applied)
  const file = '231_facebook_channel_connections.sql';
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
  const checksum = createHash('sha256').update(Buffer.from(sql, 'utf8')).digest('hex');
  await db.query(
    `INSERT INTO schema_migrations (filename, checksum_sha256)
       VALUES ($1, $2)
     ON CONFLICT (filename) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, ran_at = NOW()`,
    [file, checksum]
  );
  console.log(`Marked ${file}`);
  process.exit(0);
}

main();
