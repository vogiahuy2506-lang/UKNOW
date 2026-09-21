import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  const files = ['231_facebook_channel_connections.sql', 'custom_chatbot_chunks.sql'];
  for (const f of files) {
    const { rows } = await db.query(
      `SELECT filename, checksum_sha256 FROM schema_migrations WHERE filename = $1`,
      [f]
    );
    console.log(f + ':', rows[0] || 'NOT IN DB');
  }
  process.exit(0);
}

main();
