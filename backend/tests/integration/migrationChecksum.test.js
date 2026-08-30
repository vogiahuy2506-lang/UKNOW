/**
 * Integration coverage for migration checksum baseline on a real PostgreSQL
 * connection. The tracking table lives in an isolated temporary test schema,
 * so this test never mutates the public migration history.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import pg from 'pg';
import {
  hashMigrationContent,
  listMigrationFiles,
  runMigrationsUnlocked,
} from '../../src/utils/migrationRunner.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const testSchema = `migration_checksum_${process.pid}_${Date.now()}`;

describe('Migration Runner — checksum baseline on PostgreSQL', () => {
  let client;
  const files = listMigrationFiles();

  beforeAll(async () => {
    client = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'uknow_campaign_test',
    });
    await client.connect();
    await client.query(`CREATE SCHEMA ${testSchema}`);
    await client.query(`SET search_path TO ${testSchema}, public`);

    // Giả lập database cũ: tracking table chưa có cột checksum và mọi file
    // migration đã có trong lịch sử. Runner chỉ được baseline, không chạy DDL.
    await client.query(`
      CREATE TABLE schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        ran_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    for (const file of files) {
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
  });

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
    } finally {
      await client.end();
    }
  });

  it('adds checksum column, baselines each legacy row, then remains stable on rerun', async () => {
    await runMigrationsUnlocked(client);

    const { rows: columns } = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'schema_migrations'`,
      [testSchema]
    );
    expect(columns.map((row) => row.column_name)).toContain('checksum_sha256');

    const firstRun = await client.query(
      'SELECT filename, checksum_sha256 FROM schema_migrations ORDER BY filename'
    );
    expect(firstRun.rows).toHaveLength(files.length);
    for (const row of firstRun.rows) {
      expect(row.checksum_sha256).toBe(
        hashMigrationContent(fs.readFileSync(path.join(MIGRATIONS_DIR, row.filename)))
      );
    }

    await runMigrationsUnlocked(client);
    const secondRun = await client.query(
      'SELECT filename, checksum_sha256 FROM schema_migrations ORDER BY filename'
    );
    expect(secondRun.rows).toEqual(firstRun.rows);
  });
});
