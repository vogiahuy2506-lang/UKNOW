/**
 * Script để chạy migration 121 cho email_settings
 * Chạy: node scripts/runMigration121.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'uknow',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function runMigration() {
  const client = new pg.Client(dbConfig);
  
  try {
    await client.connect();
    console.log('Connected to database:', dbConfig.database);
    
    // Migration SQL
    const migrationSql = `
-- Migration: 121_email_settings_ensure_columns.sql
-- Ensure all required columns exist in email_settings table

BEGIN;

-- Add platform_prefix column if it doesn't exist
ALTER TABLE email_settings
ADD COLUMN IF NOT EXISTS platform_prefix VARCHAR(50) DEFAULT 'no-reply';

-- Add email_mode column if it doesn't exist
ALTER TABLE email_settings
ADD COLUMN IF NOT EXISTS email_mode TEXT DEFAULT 'platform';

-- Update existing NULL values to defaults
UPDATE email_settings SET platform_prefix = 'no-reply' WHERE platform_prefix IS NULL;
UPDATE email_settings SET email_mode = 'platform' WHERE email_mode IS NULL;

-- Set NOT NULL constraints now that all records have values
ALTER TABLE email_settings ALTER COLUMN platform_prefix SET NOT NULL;
ALTER TABLE email_settings ALTER COLUMN email_mode SET NOT NULL;

COMMIT;
`;

    console.log('Running migration 121...');
    await client.query(migrationSql);
    console.log('Migration 121 completed successfully!');
    
    // Verify the columns exist
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'email_settings' 
      AND column_name IN ('platform_prefix', 'email_mode')
    `);
    console.log('\nVerified columns:');
    console.table(result.rows);
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
