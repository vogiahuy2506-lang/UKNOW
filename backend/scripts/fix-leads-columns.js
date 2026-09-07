import 'dotenv/config';
import db from '../src/config/database.js';
import process from 'node:process';

async function run() {
  try {
    // Check if unsubscribe_token column exists
    const check1 = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'unsubscribe_token'
    `);
    if (check1.rows.length > 0) {
      console.log('[OK] Column unsubscribe_token already exists');
    } else {
      console.log('[ADD] Adding unsubscribe_token column...');
      await db.query(`
        ALTER TABLE leads ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid()
      `);
      console.log('[OK] Added unsubscribe_token');
    }

    // Check if consent_withdrawn_at column exists
    const check2 = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'consent_withdrawn_at'
    `);
    if (check2.rows.length > 0) {
      console.log('[OK] Column consent_withdrawn_at already exists');
    } else {
      console.log('[ADD] Adding consent_withdrawn_at column...');
      await db.query(`
        ALTER TABLE leads ADD COLUMN consent_withdrawn_at TIMESTAMPTZ NULL
      `);
      console.log('[OK] Added consent_withdrawn_at');
    }

    // Add unique constraint on unsubscribe_token
    try {
      await db.query(`
        ALTER TABLE leads ADD CONSTRAINT leads_unsubscribe_token_unique UNIQUE (unsubscribe_token)
      `);
      console.log('[OK] Added unique constraint on unsubscribe_token');
    } catch (e) {
      if (e.code === '42710') {
        console.log('[OK] Unique constraint already exists');
      } else {
        console.log('[WARN] Constraint error:', e.message);
      }
    }

    console.log('\nDone! All columns present.');
    process.exit(0);
  } catch (e) {
    console.error('[ERROR]', e.message);
    process.exit(1);
  }
}

run();
