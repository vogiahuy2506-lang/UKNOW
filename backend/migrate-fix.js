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

    // Fix 1: Personal chats (external_id NOT starting with 'group_') with zalo_group source -> zalo_personal
    await c.query(`
      UPDATE zalo_personal_conversations
      SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"source":"zalo_personal"}'::jsonb
      WHERE NOT (external_id LIKE 'group_%')
        AND visitor_info::text LIKE '%zalo_group%'
    `);
    console.log('Fixed zalo_group -> zalo_personal');

    // Fix 2: Personal chats with is_group=true should be false
    await c.query(`
      UPDATE zalo_personal_conversations
      SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"is_group":false}'::jsonb
      WHERE NOT (external_id LIKE 'group_%')
        AND visitor_info::text LIKE '%is_group%true%'
    `);
    console.log('Fixed is_group=true -> false');

    // Fix 3: Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
    await c.query(`
      UPDATE zalo_personal_conversations
      SET visitor_info = COALESCE(NULLIF(visitor_info::text, '')::jsonb, '{}'::jsonb) || '{"is_group":true,"source":"zalo_group"}'::jsonb
      WHERE external_id LIKE 'group_%'
    `);
    console.log('Fixed group conversations');

    // Verify
    const r = await c.query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE visitor_info::text ~ '"is_group":true') as is_group_true,
        COUNT(*) FILTER (WHERE visitor_info::text ~ '"source":"zalo_group"') as source_group
      FROM zalo_personal_conversations
    `);
    console.log('Verification:', r.rows[0]);

  } catch (e) {
    console.error(e.message);
  } finally {
    await c.end();
  }
}

run();
