import 'dotenv/config';
import db from '../src/config/database.js';
import process from 'node:process';

async function run() {
  try {
    const count = await db.query(`SELECT COUNT(*)::int AS c FROM leads`);
    console.log('Total leads:', count.rows[0].c);

    const recent = await db.query(`
      SELECT id, email, landing_page_slug, first_name, last_name, created_at
      FROM leads ORDER BY created_at DESC LIMIT 5
    `);
    for (const r of recent.rows) console.log(JSON.stringify(r));
    process.exit(0);
  } catch (e) {
    console.error('[ERROR]', e.message);
    process.exit(1);
  }
}

run();
