import 'dotenv/config';
import db from './src/config/database.js';

async function main() {
  const { rows } = await db.query(
    `DELETE FROM schema_migrations
      WHERE filename IN (
        '222_facebook_fca_channel.sql',
        '223_facebook_fca_session_appstate.sql',
        '224_facebook_fca_chatbot_settings.sql'
      )
      RETURNING filename`
  );
  console.log('Deleted:', rows);
  process.exit(0);
}

main();
