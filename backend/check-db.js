import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'ep-purple-recipe-aozj2siy-pooler.c-2.ap-southeast-1.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_NIwRYl4VLj8W',
  ssl: { rejectUnauthorized: false }
});
try {
  await c.connect();
  const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'zalo%'");
  console.log('Tables:', r.rows.map(r => r.table_name).join(', '));
  
  const r2 = await c.query("SELECT COUNT(*) FROM zalo_personal_conversations");
  console.log('Conversations:', r2.rows[0].count);
} catch (e) {
  console.error(e.message);
} finally {
  await c.end();
}
