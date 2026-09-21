import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    // Show current advisory lock holders (any pid holding the lock).
    const { rows: locks } = await db.query(`
      SELECT l.pid, l.locktype, l.mode, l.granted,
             left(s.query, 80) AS query,
             s.state, s.query_start
        FROM pg_locks l
        JOIN pg_stat_activity s ON s.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND l.granted = true
         AND s.datname = current_database()
    `);
    console.log(`Current advisory lock holders: ${locks.length}`);
    console.table(locks);

    // Force-terminate every session holding an advisory lock, plus everyone
    // waiting on one. Skip our own backend.
    const targets = await db.query(`
      SELECT DISTINCT pid
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND (
           query LIKE '%pg_advisory_lock%'
           OR state = 'idle in transaction'
           OR state = 'idle in transaction (aborted)'
         )
    `);
    console.log(`Found ${targets.rows.length} target session(s) to terminate`);

    for (const { pid } of targets.rows) {
      try {
        await db.query('SELECT pg_terminate_backend($1)', [pid]);
        console.log(`Terminated pid ${pid}`);
      } catch (err) {
        console.log(`Failed to terminate pid ${pid}: ${err.message}`);
      }
    }

    // Wait for the backend to release its lock too. Sessions that are idle but
    // still hold advisory locks won't release them until their connection closes.
    await new Promise((r) => setTimeout(r, 3000));

    const { rows: remainingLocks } = await db.query(`
      SELECT l.pid, l.mode, l.granted
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
