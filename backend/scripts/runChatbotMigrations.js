/**
 * Run chatbot migrations manually
 * Usage: node -r dotenv/config scripts/runChatbotMigrations.js
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'uknow_campaign',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const migrations = [
      '042_add_webhook_token_to_channels.sql',
      '043_chatbot_channel_connections.sql',
      '044_chatbot_conversations_messages.sql',
    ];

    for (const filename of migrations) {
      const filepath = join(__dirname, '..', 'migrations', filename);
      const sql = readFileSync(filepath, 'utf8');
      
      console.log(`\nRunning ${filename}...`);
      await client.query(sql);
      console.log(`✓ ${filename} completed`);
    }

    console.log('\n✅ All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
