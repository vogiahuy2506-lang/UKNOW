require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();

  // Check telegram_session_state table exists
  try {
    const r1 = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'telegram_session_state'");
    console.log('telegram_session_state table exists:', r1.rows.length > 0);
  } catch(e) { console.log('Error check table:', e.message); }

  // Check telegram_accounts
  try {
    const r2 = await client.query('SELECT id, id_user, is_active, chatbot_enabled FROM telegram_accounts ORDER BY id');
    console.log('telegram_accounts rows:', JSON.stringify(r2.rows, null, 2));
  } catch(e) { console.log('Error telegram_accounts:', e.message); }

  // Check telegram_session_state data
  try {
    const r3 = await client.query('SELECT telegram_user_id, left(state::text, 200) as state_preview FROM telegram_session_state');
    console.log('telegram_session_state rows:', JSON.stringify(r3.rows, null, 2));
  } catch(e) { console.log('Error telegram_session_state:', e.message); }

  client.release();
  await pool.end();
}

check().catch(e => console.error(e));
