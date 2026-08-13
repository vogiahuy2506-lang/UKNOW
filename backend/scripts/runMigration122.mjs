/**
 * Run migration 122: Create campaign_shares table
 * Usage: node scripts/runMigration122.mjs
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

    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../migrations/122_campaign_shares.sql'), 'utf8');
    console.log('Running migration 122...');
    await client.query(sql);
    console.log('Migration 122 completed successfully!');

    // Verify table was created
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'campaign_shares'
    `);
    console.log('\nVerification - Tables created:');
    console.log(`  - campaign_shares: ${result.rows.length > 0 ? 'YES' : 'NO'}`);

    // Verify columns added to campaigns
    const colResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'share_count'
    `);
    console.log(`  - campaigns.share_count: ${colResult.rows.length > 0 ? 'YES' : 'NO'}`);

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
