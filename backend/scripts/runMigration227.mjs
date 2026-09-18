/**
 * Run migration 227: Create landing_page_shares table
 * Usage: node scripts/runMigration227.mjs
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

    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../migrations/227_landing_page_shares.sql'),
      'utf8'
    );
    console.log('Running migration 227 (create landing_page_shares)...');
    await client.query(sql);
    console.log('Migration 227 completed successfully!');

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'landing_page_shares'
    `);
    console.log('Verified table exists:', result.rows.length > 0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runMigration();
