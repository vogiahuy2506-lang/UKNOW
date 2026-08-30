#!/usr/bin/env node
/**
 * Durable preflight backup for migration 174. Besides the VPS-only JSON file,
 * it records the exact eligible-row snapshot in DB. Migration 174 only
 * updates rows that still match this snapshot, protecting concurrent payments.
 */
import 'dotenv/config';
import db from '../src/config/database.js';
import { prepareBillingAnchorRepairPreflight } from '../src/utils/billingAnchorRepairBackup.util.js';

async function main() {
  const result = await prepareBillingAnchorRepairPreflight(db);
  // Machine-readable marker for the deploy workflow. Keep the human log from
  // the utility too; this line decides whether the one-time post-repair audit
  // should run before switching containers.
  console.log(`BILLING_ANCHOR_PREFLIGHT_STATUS=${result.skipped ? 'skipped' : 'prepared'}`);
}

try {
  await main();
} finally {
  await db.pool.end();
}
