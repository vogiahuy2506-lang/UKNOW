import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    const { rows: locks } = await db.query(`
      SELECT l.pid, l.locktype, l.mode, l.granted,
             s.application_name, s.state, left(s.query, 80) AS query
        FROM pg_locks l
        JOIN pg_stat_activity s ON s.pid = l.pid
       WHERE l.locktype = 'advisory'
         AND s.datname = current_database()
         AND s.pid <> pg_backend_pid()
    `);
    console.log(`Advisory lock sessions: ${locks.length}`);
    console.table(locks);

    // Check if there's a migration lock holder
    const { rows: activity } = await db.query(`
      SELECT pid, application_name, state, left(query, 80) AS query, query_start
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND application_name = 'founderai-campaign-backend'
       ORDER BY query_start
    `);
    console.log(`\nActive app sessions: ${activity.length}`);
    console.table(activity);
  } catch (err) {
    console.error(err.message);
  } finally {
    process.exit(0);
  }
}

main();
