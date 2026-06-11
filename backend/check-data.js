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
  
  // Check conversations
  const convs = await c.query("SELECT id, external_id, visitor_name, visitor_info, last_message_at FROM zalo_personal_conversations ORDER BY last_message_at DESC LIMIT 5");
  console.log('Conversations:');
  convs.rows.forEach(row => {
    console.log(`  ID: ${row.id}, ext: ${row.external_id}, name: ${row.visitor_name}, info: ${row.visitor_info?.substring?.(0, 100)}, last: ${row.last_message_at}`);
  });
  
  // Check messages
  const msgs = await c.query("SELECT id, id_conversation, role, LEFT(content, 50), created_at FROM zalo_personal_messages ORDER BY created_at DESC LIMIT 10");
  console.log('\nMessages:');
  msgs.rows.forEach(row => {
    console.log(`  ID: ${row.id}, conv: ${row.id_conversation}, role: ${row.role}, content: ${row.content}, time: ${row.created_at}`);
  });
} catch (e) {
  console.error(e.message);
} finally {
  await c.end();
}
