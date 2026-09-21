import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    // Terminate ALL 'founderai-campaign-backend' sessions (these are all the running backends).
    // The migration runner will be a fresh process that will acquire the lock cleanly.
    const { rows } = await db.query(`
      SELECT pg_terminate_backend(pid) AS terminated,
             pid, application_name, state
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND application_name = 'founderai-campaign-backend'
         AND pid <> pg_backend_pid()
    `);
    console.log(`Terminated ${rows.length} session(s):`);
    rows.forEach(r => console.log(`  pid=${r.pid} state=${r.state}`));

    // Wait for sessions to die
    await new Promise(r => setTimeout(r, 3000));

    // Verify lock is released
    const { rows: locks } = await db.query(`
      SELECT l.pid, l.mode, l.granted, s.state
        FROM pg_locks l
        JOIN pg_stat_activity s ON s.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND s.datname = current_database()
         AND s.pid <> pg_backend_pid()
    `);
    console.log(`\nRemaining advisory locks: ${locks.length}`);
    if (locks.length > 0) console.table(locks);
    else console.log('Lock CLEAR!');
  } catch (err) {
    console.error(err.message);
  } finally {
    process.exit(0);
  }
}

main();
