/**
 * Run migration 123: Fix campaigns.origin column width
 * 'marketplace_purchased' (21 chars) overflowed VARCHAR(20)
 * Usage: node scripts/runMigration123.cjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../migrations/131_fix_campaign_origin_width.sql'), 'utf8');
    console.log('Running migration 131 (fix campaigns.origin width)...');
    await client.query(sql);
    console.log('Migration 131 completed successfully!');

    const result = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'origin'
    `);
    console.log('\nVerification - campaigns.origin:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}(${row.character_maximum_length})`);
    });

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
