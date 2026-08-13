const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  host: 'ep-purple-recipe-aozj2siy-pooler.c-2.ap-southeast-1.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_NIwRYl4VLj8W',
  ssl: { rejectUnauthorized: false },
});

const sql = fs.readFileSync('./migrations/122_create_email_settings_table.sql', 'utf8');

async function run() {
  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(sql);
    console.log('Migration 122 completed!');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

run();
