import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    const { rows } = await db.query(`SHOW lock_timeout`);
    console.log('lock_timeout:', rows);
    const { rows: st } = await db.query(`SHOW statement_timeout`);
    console.log('statement_timeout:', st);
    const { rows: idle } = await db.query(`SHOW idle_session_timeout`);
    console.log('idle_session_timeout:', idle);

    // Try to acquire the advisory lock directly
    console.log('Trying to acquire advisory lock...');
    await db.query(`SELECT pg_advisory_lock(hashtext('schema:migrations'), hashtext('migration_runner'))`);
    console.log('LOCK ACQUIRED!');
    await db.query(`SELECT pg_advisory_unlock(hashtext('schema:migrations'), hashtext('migration_runner'))`);
    console.log('LOCK RELEASED');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
}

main();
