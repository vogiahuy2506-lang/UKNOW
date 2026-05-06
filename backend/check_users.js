import 'dotenv/config';
import db from './src/config/database.js';

async function checkUsers() {
  try {
    const users = await db.query('SELECT username, email FROM users ORDER BY created_at DESC LIMIT 5');
    console.log('Recent users:', users.rows);
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    process.exit();
  }
}

checkUsers();
