/**
 * Run migration 121: Add marketplace_origin column to campaigns
 * Usage: node scripts/runMigration121.cjs
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

    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../migrations/121_campaign_origin.sql'), 'utf8');
    console.log('Running migration 121...');
    await client.query(sql);
    console.log('Migration 121 completed successfully!');

    // Verify columns were added
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name IN ('origin', 'marketplace_purchase_id')
    `);
    console.log('\nVerification - Columns added to campaigns table:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error) {
    console.error('Migration failed:', error.message);
    if (error.code === '42701') {
      console.log('\nColumn already exists - migration was already run.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
