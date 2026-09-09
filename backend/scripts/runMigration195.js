#!/usr/bin/env node
/**
 * One-shot migration runner for migration 195 (user_whatsapp_app_credentials).
 *
 * Split the SQL into top-level statements while preserving:
 *   - $$ ... $$ dollar-quoted strings (so DO blocks stay intact)
 *   - single-quoted strings ' ... ' (so embedded semicolons inside COMMENT
 *     values or text literals do not split the parent statement).
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
  '195_user_whatsapp_app_credentials.sql'
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

function splitStatementsRespectingQuotes(sql) {
  const stmts = [];
  let cursor = 0;
  while (cursor < sql.length) {
    const ws = sql.slice(cursor).match(/^\s*/)[0];
    cursor += ws.length;
    if (cursor >= sql.length) break;

    let buffer = '';
    let inDollar = false;
    let dollarTag = '';
    let inSingle = false;
    while (cursor < sql.length) {
      const slice = sql.slice(cursor);

      const dqMatch = slice.match(/^(\$[A-Za-z0-9_]*\$)/);
      if (dqMatch) {
        const tag = dqMatch[1];
        if (!inDollar && !inSingle) {
          inDollar = true;
          dollarTag = tag;
          buffer += tag;
          cursor += tag.length;
          continue;
        }
        if (inDollar && tag === dollarTag) {
          inDollar = false;
          dollarTag = '';
          buffer += tag;
          cursor += tag.length;
          continue;
        }
      }

      const ch = sql[cursor];

      // Single-quoted string handling: honor '' as escaped quote, but only
      // when NOT inside a $$ block (those use dollar quotes).
      if (!inDollar) {
        if (!inSingle && ch === "'") {
          inSingle = true;
          buffer += ch;
          cursor += 1;
          continue;
        }
        if (inSingle) {
          buffer += ch;
          cursor += 1;
          if (ch === "'") {
            // Lookahead: if next char is also ', it's an escaped quote.
            if (sql[cursor] === "'") {
              buffer += "'";
              cursor += 1;
            } else {
              inSingle = false;
            }
          }
          continue;
        }
      }

      buffer += ch;
      cursor += 1;
      if (!inDollar && !inSingle && ch === ';') break;
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
  const statements = splitStatementsRespectingQuotes(cleaned);
  console.log(`[Migrate195] Tìm thấy ${statements.length} statement(s).`);

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
          msg.includes('already exists')
          || msg.includes('does not exist')
          || msg.includes('duplicate')
        ) {
          console.warn(`[Migrate195] (${i + 1}/${statements.length}) bỏ qua: ${err.message}`);
          continue;
        }
        console.error(`[Migrate195] ❌ Statement ${i + 1} thất bại:`);
        console.error(`SQL: ${stmt.slice(0, 240).replace(/\s+/g, ' ')}${stmt.length > 240 ? '…' : ''}`);
        console.error(`Lỗi: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(`[Migrate195] ✅ Hoàn tất ${successCount}/${statements.length} statement(s).`);

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'user_whatsapp_app_credentials';`
    );
    console.log(
      '[Migrate195] Bảng user_whatsapp_app_credentials:',
      tables.rows.length > 0 ? 'TỒN TẠI ✅' : '❌'
    );
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
