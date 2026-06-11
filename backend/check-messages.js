import pg from 'pg';
const { Client } = pg;

async function run() {
  const c = new Client({
    host: 'ep-purple-recipe-aozj2siy-pooler.c-2.ap-southeast-1.aws.neon.tech',
    port: 5432,
    database: 'neondb',
    user: 'neondb_owner',
    password: 'npg_NIwRYl4VLj8W',
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    
    // Check messages with is_group=true
    const r = await c.query(`
      SELECT id, id_conversation, content, metadata
      FROM zalo_personal_messages
      WHERE metadata->>'is_group' = 'true'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('Messages with is_group=true:', r.rows.length);
    if (r.rows.length > 0) {
      console.log(JSON.stringify(r.rows[0], null, 2));
    }
    
    // Check recent messages
    const recent = await c.query(`
      SELECT id, id_conversation, content, metadata
      FROM zalo_personal_messages
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\nRecent messages:');
    recent.rows.forEach(row => {
      console.log(`ID=${row.id}, conv=${row.id_conversation}, content=${row.content}, metadata=${JSON.stringify(row.metadata)}`);
    });

  } catch (e) {
    console.error(e.message);
  } finally {
    await c.end();
  }
}

run();
