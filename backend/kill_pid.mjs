import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    const targetPid = 4900;
    const { rows } = await db.query('SELECT pg_terminate_backend($1) AS terminated', [targetPid]);
    console.log(`Terminate result:`, rows);

    await new Promise((r) => setTimeout(r, 3000));

    const { rows: remainingLocks } = await db.query(`
      SELECT l.pid, l.mode, l.granted, s.state, left(s.query, 80) AS query
        FROM pg_locks l
        JOIN pg_stat_activity s ON s.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND l.granted = true
         AND s.datname = current_database()
    `);
    console.log(`Remaining advisory lock holders: ${remainingLocks.length}`);
    console.table(remainingLocks);
  } catch (err) {
    console.error(err.message);
  } finally {
    process.exit(0);
  }
}

main();
