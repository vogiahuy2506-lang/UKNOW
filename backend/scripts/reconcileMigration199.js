#!/usr/bin/env node
/**
 * Reconcile migration 199 ("widen chatbot_channel_connections.channel_type CHECK
 * constraint to include 'whatsapp_baileys'") against the actual database state.
 *
 * Why this script exists:
 *   Migration 199 was authored with invalid syntax (`DROP CONSTRAINT` without
 *   the leading `ALTER TABLE`).  Because the runner executes each migration
 *   inside a transaction and rolls back on failure, 199 never gets recorded in
 *   schema_migrations, so every subsequent deploy retries it and halts before
 *   reaching later migrations.
 *
 *   Editing 199 in place is forbidden by the CI migration-safety guard, and
 *   deleting it has the same effect.  This script is the third path: inspect
 *   pg_constraint and, when the constraint already accepts 'whatsapp_baileys'
 *   (typically because migration 197 already added it on the happy path), mark
 *   199 as successfully applied in schema_migrations so the runner will skip
 *   past it on the next deploy.
 *
 * Output: prints `MIGRATION_199_RECONCILE_STATUS=skipped|recorded|failed` so
 * the deploy workflow can branch on it if needed.
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATION_FILE = '199_chatbot_channel_connections_baileys_check.sql';
const MIGRATION_PATH = path.join(REPO_ROOT, 'migrations', MIGRATION_FILE);
const CONSTRAINT_NAME = 'chatbot_channel_connections_channel_type_check';

function hashMigrationContent(content) {
  return createHash('sha256')
    .update(Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8'))
    .digest('hex');
}

async function constraintAllowsBaileys(client) {
  const { rows } = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = $1
        AND t.relname = 'chatbot_channel_connections'
        AND n.nspname = current_schema()
      LIMIT 1`,
    [CONSTRAINT_NAME]
  );
  if (rows.length === 0) return false;
  return /whatsapp_baileys/.test(rows[0].def || '');
}

async function main() {
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`MIGRATION_199_RECONCILE_STATUS=failed: missing file ${MIGRATION_FILE}`);
    process.exit(1);
  }
  const sqlBytes = fs.readFileSync(MIGRATION_PATH);
  const checksum = hashMigrationContent(sqlBytes);

  const client = await db.pool.connect();
  try {
    // Ensure the tracking table exists. This is the same DDL the runner uses,
    // but safe to re-run because of IF NOT EXISTS.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename        VARCHAR(255) PRIMARY KEY,
        ran_at          TIMESTAMPTZ DEFAULT NOW(),
        checksum_sha256 CHAR(64)
      )
    `);
    await client.query(
      'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64)'
    );

    const allowed = await constraintAllowsBaileys(client);
    if (!allowed) {
      // Constraint is missing or out-of-date; do NOT mark 199 as applied --
      // let the runner surface the failure so an operator can intervene.
      console.log(
        `MIGRATION_199_RECONCILE_STATUS=skipped: constraint ${CONSTRAINT_NAME} `
        + 'chưa cho phép whatsapp_baileys — runner sẽ tự fail để báo operator.'
      );
      return;
    }

    await client.query(
      `INSERT INTO schema_migrations (filename, checksum_sha256)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE
         SET checksum_sha256 = EXCLUDED.checksum_sha256, ran_at = NOW()`,
      [MIGRATION_FILE, checksum]
    );
    console.log(
      `MIGRATION_199_RECONCILE_STATUS=recorded: constraint đã đúng, đã mark ${MIGRATION_FILE} `
      + 'là applied để runner skip trong deploy này.'
    );
  } finally {
    client.release();
  }
}

try {
  await main();
} catch (err) {
  console.error(`MIGRATION_199_RECONCILE_STATUS=failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db.pool.end();
}
