import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  try {
    const { rows } = await db.query(`
      SELECT pid, usename, application_name, state, query_start,
             left(query, 100) as query
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND state IS NOT NULL
         AND pid <> pg_backend_pid()
       ORDER BY query_start NULLS LAST
    `);
    console.log(`Active sessions: ${rows.length}`);
    console.table(rows);

    // Find advisory locks on schema:migrations / migration_runner
    const { rows: locks } = await db.query(`
      SELECT pid, locktype, mode,
             left(CAST(classid AS TEXT), 30) as classid,
             left(CAST(objid AS TEXT), 30) as objid,
             granted
        FROM pg_locks
       WHERE locktype = 'advisory'
         AND (objid IN (
           SELECT ('x' || substr(hashtext('schema:migrations')::text, 1, 8))::bit(32)::int,
                  ('x' || substr(hashtext('migration_runner')::text, 1, 8))::bit(32)::int
         ))
    `);
    console.log(`Advisory locks: ${locks.length}`);
    console.table(locks);
  } catch (err) {
    console.error(err.message);
  } finally {
    process.exit(0);
  }
}

main();
