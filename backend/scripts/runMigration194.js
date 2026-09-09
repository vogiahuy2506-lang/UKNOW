#!/usr/bin/env node
/**
 * One-shot migration runner for migration 194 (WhatsApp).
 *
 * Tách các DO $$ ... $$ blocks khỏi phần SQL thường vì dollar-quoted strings
 * chứa nhiều dấu ; và làm trình split-statement đơn giản vỡ cú pháp.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  'migrations',
  '194_chatbot_whatsapp_channel_and_settings.sql'
);

function stripComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

// Split a SQL body into top-level statements while preserving `$$ ... $$`
// blocks (DO blocks, function bodies) as a single statement regardless of
// internal semicolons.
function splitStatementsRespectingDollarQuotes(sql) {
  const stmts = [];
  let cursor = 0;
  while (cursor < sql.length) {
    // Skip whitespace
    const ws = sql.slice(cursor).match(/^\s*/)[0];
    cursor += ws.length;
    if (cursor >= sql.length) break;

    let buffer = '';
    let inDollar = false;
    let dollarTag = '';
    while (cursor < sql.length) {
      const slice = sql.slice(cursor);
      // Detect `$$` (or $tag$) at the current position to toggle dollar-quote mode
      const dqMatch = slice.match(/^(\$[A-Za-z0-9_]*\$)/);
      if (dqMatch) {
        const tag = dqMatch[1];
        if (!inDollar) {
          // Opening dollar quote: scan ahead to ensure we are not just part of a $-token
          // Accept any $tag$ as opening.
          inDollar = true;
          dollarTag = tag;
          buffer += tag;
          cursor += tag.length;
          continue;
        }
        if (tag === dollarTag) {
          // Closing dollar quote
          inDollar = false;
          dollarTag = '';
          buffer += tag;
          cursor += tag.length;
          continue;
        }
      }
      const ch = sql[cursor];
      buffer += ch;
      cursor += 1;
      if (!inDollar && ch === ';') break;
    }
    const trimmed = buffer.trim();
    if (trimmed.length > 0) stmts.push(trimmed);
  }
  return stmts;
}

async function main() {
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`Không tìm thấy file migration: ${MIGRATION_FILE}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const cleaned = stripComments(raw);
  const statements = splitStatementsRespectingDollarQuotes(cleaned);
  console.log(`[Migrate194] Tìm thấy ${statements.length} statement(s).`);

  const client = await db.getClient();
  let successCount = 0;
  try {
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
        successCount += 1;
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (
          msg.includes('already exists') ||
          msg.includes('does not exist') ||
          msg.includes('duplicate')
        ) {
          console.warn(`[Migrate194] (${i + 1}/${statements.length}) bỏ qua: ${err.message}`);
          continue;
        }
        console.error(`[Migrate194] ❌ Statement ${i + 1} thất bại:`);
        console.error(
          `SQL: ${stmt.slice(0, 240).replace(/\s+/g, ' ')}${stmt.length > 240 ? '…' : ''}`
        );
        console.error(`Lỗi: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(
      `[Migrate194] ✅ Hoàn tất ${successCount}/${statements.length} statement(s).`
    );

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'chatbot_whatsapp_account_settings';`
    );
    console.log(
      '[Migrate194] Bảng chatbot_whatsapp_account_settings:',
      tables.rows.length > 0 ? 'TỒN TẠI ✅' : '❌'
    );

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'chatbot_channel_connections'
         AND column_name IN ('phone_number','waba_id','phone_number_id','business_id','app_id');`
    );
    console.log(
      '[Migrate194] Cột WhatsApp trên chatbot_channel_connections:',
      cols.rows.map((r) => r.column_name).join(', ') || '(trống)'
    );
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
