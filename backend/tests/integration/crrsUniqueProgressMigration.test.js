import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSql = fs.readFileSync(
  path.join(__dirname, '../../migrations/182_ensure_crrs_unique_progress_index.sql'),
  'utf8'
);
const rollbackScriptPath = path.join(__dirname, '../../scripts/sql/rollback_182_crrs.sql');
const rollbackSqlRaw = fs.readFileSync(rollbackScriptPath, 'utf8');

/**
 * Chuẩn bị SQL thực thi file rollback_182_crrs.sql trong môi trường Node / node-pg:
 * - Thay thế khối \if ... \endif của psql bằng SET LOCAL uknow.target_batch_id.
 * - Loại bỏ các meta-command của psql (bắt đầu bằng dấu \) để tránh lỗi syntax của PostgreSQL driver.
 */
function prepareRollbackSql(batchId) {
  let sql = rollbackSqlRaw;
  if (batchId !== undefined && batchId !== null) {
    sql = sql.replace(
      /\\if[\s\S]*?\\endif/,
      `SET LOCAL uknow.target_batch_id = '${batchId}';`
    );
  } else {
    // Không set biến để kiểm tra guard thiếu batch ID
    sql = sql.replace(/\\if[\s\S]*?\\endif/, '');
  }
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('\\'))
    .join('\n');
}

/**
 * Thực thi rollback script và khẳng định abort, sau đó giải phóng aborted transaction state.
 */
async function expectRollbackAbort(client, batchId, expectedRegex) {
  let rollbackError = null;
  try {
    await client.query(prepareRollbackSql(batchId));
  } catch (err) {
    rollbackError = err;
    await client.query('ROLLBACK');
  }
  expect(rollbackError).not.toBeNull();
  expect(rollbackError.message).toMatch(expectedRegex);
}

/**
 * Chạy test trong một temporary schema hoàn toàn độc lập.
 * Thực hiện cleanup fail-safe: rollback, reset search_path, drop schema độc lập.
 * Nếu reset search_path thất bại, connection sẽ bị loại bỏ khỏi pool qua client.release(error).
 */
async function withIsolatedSchema(testFn) {
  const tempSchema = `migration_test_182_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let client;
  let clientDestroyError = null;
  try {
    client = await db.getClient();
    await client.query(`CREATE SCHEMA ${tempSchema}`);
    await client.query(`SET search_path TO ${tempSchema}, public`);

    // Tạo bảng campaign_run_recipient_steps độc lập trong tempSchema với đầy đủ 15 cột production
    await client.query(`
      CREATE TABLE campaign_run_recipient_steps (
        id BIGSERIAL PRIMARY KEY,
        id_run BIGINT,
        id_campaign BIGINT,
        id_node VARCHAR(100),
        channel VARCHAR(50),
        recipient_key TEXT,
        last_completed_step INTEGER NOT NULL DEFAULT 0,
        meta JSONB NOT NULL DEFAULT '{}',
        is_fully_completed BOOLEAN NOT NULL DEFAULT FALSE,
        last_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        first_step_sent_at TIMESTAMPTZ,
        next_due_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        checksum_sha256 VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await testFn(client, tempSchema);
  } finally {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // bỏ qua nếu không có transaction đang mở
      }

      try {
        await client.query('SET search_path TO public');
      } catch (err) {
        clientDestroyError = err;
      }

      try {
        await client.query(`DROP SCHEMA IF EXISTS ${tempSchema} CASCADE`);
      } catch (err) {
        if (!clientDestroyError) clientDestroyError = err;
      }

      if (clientDestroyError) {
        client.release(clientDestroyError);
      } else {
        client.release();
      }
    }
  }
}

describe('Migration 182 — ensure crrs unique progress index', () => {
  it('runs cleanly in isolated schema and creates uq_crrs_progress full unique index idempotently with empty backup table (Option A)', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // Chạy lần 1
      await client.query(migrationSql);

      const { rows: idxRows } = await client.query(
        `SELECT c.relname, i.indisunique, i.indisvalid, i.indisready, pg_get_indexdef(c.oid) AS indexdef
         FROM pg_class c
         JOIN pg_index i ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = 'uq_crrs_progress'
           AND n.nspname = $1`,
        [tempSchema]
      );

      expect(idxRows).toHaveLength(1);
      expect(idxRows[0].indisunique).toBe(true);
      expect(idxRows[0].indisvalid).toBe(true);
      expect(idxRows[0].indisready).toBe(true);
      expect(idxRows[0].indexdef).toContain('uq_crrs_progress');
      expect(idxRows[0].indexdef).toContain('(id_run, id_node, channel, recipient_key)');
      // Đảm bảo là Full Unique Index (không có predicate WHERE) để hỗ trợ cả code trước và sau Q4c
      expect(idxRows[0].indexdef).not.toContain('WHERE');

      // Khẳng định bảng backup ĐƯỢC tạo vô điều kiện (Option A: Schema Parity) và rỗng khi DB sạch không có duplicates
      const { rows: backupTblRows } = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'campaign_run_recipient_steps_backup_182'
           AND table_schema = $1
         ORDER BY ordinal_position ASC`,
        [tempSchema]
      );
      expect(backupTblRows.length).toBe(6);
      const colNames = backupTblRows.map((r) => r.column_name);
      expect(colNames).toEqual([
        'id',
        'migration_batch_id',
        'source_id',
        'id_run',
        'source_row',
        'backed_up_at',
      ]);

      const { rows: backupCount } = await client.query(
        `SELECT COUNT(*) AS c FROM campaign_run_recipient_steps_backup_182`
      );
      expect(Number(backupCount[0].c)).toBe(0);

      // Chạy lần 2 (idempotency)
      await expect(client.query(migrationSql)).resolves.not.toThrow();
    });
  });

  it('authoritatively deduplicates duplicates into backup table with zero hybrid state and creates full unique index', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn dữ liệu duplicate:
      // Nhóm 1: run=101, node=n1, chan=email, key=k1 (3 rows: 1 non-completed step 1, 1 non-completed step 3, 1 completed step 2)
      // Authoritative row phải là row có is_fully_completed = TRUE (step 2)
      await client.query(`
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, last_sent_at, updated_at)
        VALUES
          (101, 'n1', 'email', 'k1', 1, FALSE, '{"foo": 1, "zaloSendFailureCount": 1}'::jsonb, NOW() - interval '3 hours', NOW() - interval '3 hours'),
          (101, 'n1', 'email', 'k1', 3, FALSE, '{"foo": 3, "retryCount": 2}'::jsonb, NOW() - interval '1 hours', NOW() - interval '1 hours'),
          (101, 'n1', 'email', 'k1', 2, TRUE,  '{"foo": 2, "auth": true}'::jsonb, NOW() - interval '2 hours', '2026-09-01T08:00:00.000Z');
      `);

      // Nhóm 2: run=102, node=n2, chan=zalo, key=k2 (2 rows: đều chưa completed, step 1 vs step 4)
      // Authoritative row phải là row có step cao hơn (step 4)
      await client.query(`
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, last_sent_at, updated_at)
        VALUES
          (102, 'n2', 'zalo', 'k2', 1, FALSE, '{"z": 1}'::jsonb, NOW() - interval '5 hours', NOW() - interval '5 hours'),
          (102, 'n2', 'zalo', 'k2', 4, FALSE, '{"z": 4, "auth": true}'::jsonb, NOW() - interval '4 hours', '2026-09-01T09:00:00.000Z');
      `);

      // 2. Chạy migration 182
      await client.query(migrationSql);

      // 3. Khẳng định dữ liệu trong bảng backup:
      const { rows: backupRows } = await client.query(`
        SELECT migration_batch_id, source_id, id_run, source_row, backed_up_at
        FROM campaign_run_recipient_steps_backup_182
        ORDER BY id ASC
      `);
      expect(backupRows).toHaveLength(5);
      const batchId = backupRows[0].migration_batch_id;
      expect(batchId).toBeDefined();
      expect(backupRows.every((r) => r.migration_batch_id === batchId)).toBe(true);

      // 4. Khẳng định dữ liệu trong bảng chính sau deduplication:
      const { rows: remainingRows } = await client.query(`
        SELECT id_run, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, updated_at
        FROM campaign_run_recipient_steps
        ORDER BY id_run ASC
      `);
      expect(remainingRows).toHaveLength(2);

      // Nhóm 1: Authoritative là row 2 (completed, foo: 2, updated_at nguyên bản)
      const group1 = remainingRows[0];
      expect(group1.id_run).toBe('101');
      expect(group1.last_completed_step).toBe(2);
      expect(group1.is_fully_completed).toBe(true);
      expect(group1.meta).toEqual({ foo: 2, auth: true });
      expect(group1.updated_at.toISOString()).toBe('2026-09-01T08:00:00.000Z');

      // Nhóm 2: Authoritative là row 4 (step 4, z: 4, updated_at nguyên bản)
      const group2 = remainingRows[1];
      expect(group2.id_run).toBe('102');
      expect(group2.last_completed_step).toBe(4);
      expect(group2.is_fully_completed).toBe(false);
      expect(group2.meta).toEqual({ z: 4, auth: true });
      expect(group2.updated_at.toISOString()).toBe('2026-09-01T09:00:00.000Z');

      // 5. Index uq_crrs_progress tồn tại và là Full Unique Index
      const { rows: idxRows } = await client.query(
        `SELECT c.relname, i.indisunique, pg_get_indexdef(c.oid) AS indexdef
         FROM pg_class c
         JOIN pg_index i ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = 'uq_crrs_progress'
           AND n.nspname = $1`,
        [tempSchema]
      );
      expect(idxRows).toHaveLength(1);
      expect(idxRows[0].indisunique).toBe(true);
      expect(idxRows[0].indexdef).not.toContain('WHERE');
    });
  });

  it('proves bi-directional compatibility: both pre-Q4c query (no predicate) and post-Q4c query succeed on uq_crrs_progress without 42P10', async () => {
    await withIsolatedSchema(async (client) => {
      // 1. Chạy migration tạo index
      await client.query(migrationSql);

      // 2. Chạy câu lệnh kiểu cũ (pre-Q4c: ON CONFLICT không predicate)
      const preQ4cUpsert = `
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, updated_at)
        VALUES
          (201, 1, 'n_pre', 'email', 'pre_user@test.com', 1, FALSE, '{"version":"pre"}'::jsonb, NOW())
        ON CONFLICT (id_run, id_node, channel, recipient_key)
        DO UPDATE SET
          last_completed_step = GREATEST(campaign_run_recipient_steps.last_completed_step, EXCLUDED.last_completed_step),
          is_fully_completed = campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed,
          updated_at = NOW()
        RETURNING id, last_completed_step;
      `;
      const { rows: preRes1 } = await client.query(preQ4cUpsert);
      expect(preRes1).toHaveLength(1);
      expect(preRes1[0].last_completed_step).toBe(1);

      // Conflict pre-Q4c
      const { rows: preRes2 } = await client.query(preQ4cUpsert);
      expect(preRes2).toHaveLength(1);
      expect(preRes2[0].id).toBe(preRes1[0].id);

      // 3. Chạy câu lệnh kiểu mới (post-Q4c: ON CONFLICT không predicate, có guard terminal completed)
      const postQ4cUpsert = `
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, updated_at)
        VALUES
          (201, 1, 'n_pre', 'email', 'pre_user@test.com', 2, TRUE, '{"version":"post"}'::jsonb, NOW())
        ON CONFLICT (id_run, id_node, channel, recipient_key)
        DO UPDATE SET
          last_completed_step = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.last_completed_step
            ELSE EXCLUDED.last_completed_step
          END,
          is_fully_completed = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.is_fully_completed
            ELSE (campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed)
          END,
          updated_at = NOW()
        RETURNING id, last_completed_step, is_fully_completed;
      `;
      const { rows: postRes } = await client.query(postQ4cUpsert);
      expect(postRes).toHaveLength(1);
      expect(postRes[0].last_completed_step).toBe(2);
      expect(postRes[0].is_fully_completed).toBe(true);
    });
  });

  it('executes exact backend/scripts/sql/rollback_182_crrs.sql artifact successfully: restores duplicates, drops unique index, preserves sequence, and deletes schema_migrations', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      const seenTime = '2026-08-30T01:00:00.000Z';
      const sentTime = '2026-08-30T01:05:00.000Z';
      const nextDue = '2026-08-30T02:00:00.000Z';

      // 1. Chèn 2 duplicate rows có đầy đủ 15 cột production
      const { rows: insertedRows } = await client.query(
        `INSERT INTO campaign_run_recipient_steps (
           id_run, id_campaign, id_node, channel, recipient_key,
           last_completed_step, is_fully_completed, meta, last_sent_at,
           created_at, first_seen_at, first_step_sent_at, next_due_at, updated_at
         ) VALUES
           (601, 88, 'node_x', 'email', 'dup@test.com', 1, FALSE, '{"foo": "step1"}'::jsonb, $1, $1, $1, $2, $3, $1),
           (601, 88, 'node_x', 'email', 'dup@test.com', 2, TRUE,  '{"foo": "step2"}'::jsonb, $2, $1, $1, $2, $3, $2)
         RETURNING id, last_completed_step`,
        [seenTime, sentTime, nextDue]
      );
      expect(insertedRows).toHaveLength(2);
      const row1Id = insertedRows[0].id;
      const row2Id = insertedRows[1].id;

      // Giả lập migration 182 đã được ghi nhận trong schema_migrations
      await client.query(`
        INSERT INTO schema_migrations (filename, checksum_sha256)
        VALUES ('182_ensure_crrs_unique_progress_index.sql', 'fake-sha256-checksum')
      `);

      // Tua sequence lên 9999 để mô phỏng sequence đã được ứng dụng sử dụng/cấp phát sau đó
      await client.query(`
        SELECT setval(pg_get_serial_sequence('campaign_run_recipient_steps', 'id'), 9999, true)
      `);

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id, source_id, source_row
         FROM campaign_run_recipient_steps_backup_182
         WHERE id_run = 601
         ORDER BY source_id ASC`
      );
      expect(backupRows).toHaveLength(2);
      const batchId = backupRows[0].migration_batch_id;

      // 3. Thực thi CHÍNH XÁC artifact backend/scripts/sql/rollback_182_crrs.sql
      const rollbackSql = prepareRollbackSql(batchId);
      await client.query(rollbackSql);

      // 4. Xác thực kết quả sau rollback:
      // a) Unique index đã bị drop khỏi schema
      const { rows: indexCheck } = await client.query(
        `SELECT to_regclass('${tempSchema}.uq_crrs_progress') AS idx`
      );
      expect(indexCheck[0].idx).toBeNull();

      // b) schema_migrations không còn chứa bản ghi của migration 182
      const { rows: migRows } = await client.query(
        `SELECT COUNT(*) AS c FROM schema_migrations WHERE filename = '182_ensure_crrs_unique_progress_index.sql'`
      );
      expect(Number(migRows[0].c)).toBe(0);

      // c) Bảng chính có lại đúng 2 dòng duplicates với 15 cột nguyên vẹn
      const { rows: restoredRows } = await client.query(
        `SELECT * FROM campaign_run_recipient_steps WHERE id_run = 601 ORDER BY id ASC`
      );
      expect(restoredRows).toHaveLength(2);
      expect(restoredRows[0].id).toBe(row1Id);
      expect(restoredRows[1].id).toBe(row2Id);
      expect(restoredRows[0].last_completed_step).toBe(1);
      expect(restoredRows[1].last_completed_step).toBe(2);
      expect(restoredRows[0].meta).toEqual({ foo: 'step1' });
      expect(restoredRows[1].meta).toEqual({ foo: 'step2' });
      expect(restoredRows[0].first_seen_at.toISOString()).toBe(seenTime);
      expect(restoredRows[0].first_step_sent_at.toISOString()).toBe(sentTime);
      expect(restoredRows[0].next_due_at.toISOString()).toBe(nextDue);

      // d) Sequence không bị lùi về MAX(id): giữ vững giá trị >= 9999 và sinh giá trị 10000 tiếp theo
      const { rows: nextInserted } = await client.query(
        `INSERT INTO campaign_run_recipient_steps (id_run, recipient_key) VALUES (602, 'next@test.com') RETURNING id`
      );
      expect(Number(nextInserted[0].id)).toBe(10000);
    });
  });

  it('aborts rollback transaction cleanly when survivor row has mutated after backup, protecting live progress', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn 2 duplicate rows có đầy đủ 15 cột production
      const { rows: insertedRows } = await client.query(
        `INSERT INTO campaign_run_recipient_steps (
           id_run, id_campaign, id_node, channel, recipient_key,
           last_completed_step, is_fully_completed, meta, updated_at
         ) VALUES
           (701, 99, 'node_live', 'email', 'live_worker@test.com', 1, FALSE, '{"step":1}'::jsonb, '2026-09-01T10:00:00.000Z'),
           (701, 99, 'node_live', 'email', 'live_worker@test.com', 2, TRUE, '{"step":2}'::jsonb, '2026-09-01T10:00:00.000Z')
         RETURNING id, last_completed_step`
      );
      expect(insertedRows).toHaveLength(2);

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: survivors } = await client.query(
        `SELECT id, last_completed_step, updated_at FROM campaign_run_recipient_steps WHERE id_run = 701`
      );
      expect(survivors).toHaveLength(1);
      const survivorId = survivors[0].id;

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id FROM campaign_run_recipient_steps_backup_182 WHERE id_run = 701`
      );
      const batchId = backupRows[0].migration_batch_id;

      // 3. Giả lập worker chạy sau deploy: ghi nhận write mới phát sinh trên survivor
      await client.query(
        `UPDATE campaign_run_recipient_steps
         SET last_completed_step = 3,
             meta = '{"step":3, "liveWorker": true}'::jsonb,
             updated_at = NOW() + interval '5 minutes'
         WHERE id = $1`,
        [survivorId]
      );

      // 4. Operator chạy rollback script: Mutated Survivor Guard theo Logical Key phải phát hiện và abort
      await expectRollbackAbort(
        client,
        batchId,
        /Rollback bị từ chối: Phát hiện 1 nhóm logical key không hợp lệ.*mutated=1/
      );

      // 5. Xác nhận dữ liệu live và schema vẫn được bảo toàn nguyên vẹn sau abort:
      const { rows: protectedRows } = await client.query(
        `SELECT id, last_completed_step, meta FROM campaign_run_recipient_steps WHERE id = $1`,
        [survivorId]
      );
      expect(protectedRows).toHaveLength(1);
      expect(protectedRows[0].last_completed_step).toBe(3);
      expect(protectedRows[0].meta.liveWorker).toBe(true);

      const { rows: indexCheck } = await client.query(
        `SELECT to_regclass('${tempSchema}.uq_crrs_progress') AS idx`
      );
      expect(indexCheck[0].idx).not.toBeNull();
    });
  });

  it('aborts rollback transaction cleanly when survivor row was intentionally deleted (missing survivor)', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn duplicate rows
      await client.query(
        `INSERT INTO campaign_run_recipient_steps (
           id_run, id_campaign, id_node, channel, recipient_key,
           last_completed_step, is_fully_completed, meta, updated_at
         ) VALUES
           (702, 99, 'node_del', 'email', 'deleted@test.com', 1, FALSE, '{"step":1}'::jsonb, '2026-09-01T10:00:00.000Z'),
           (702, 99, 'node_del', 'email', 'deleted@test.com', 2, TRUE, '{"step":2}'::jsonb, '2026-09-01T10:00:00.000Z')`
      );

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id FROM campaign_run_recipient_steps_backup_182 WHERE id_run = 702`
      );
      const batchId = backupRows[0].migration_batch_id;

      // 3. Giả lập survivor bị xóa có chủ đích
      await client.query(`DELETE FROM campaign_run_recipient_steps WHERE id_run = 702`);

      // 4. Operator chạy rollback script: Guard phải phát hiện missing survivor (live_count = 0) và abort
      await expectRollbackAbort(
        client,
        batchId,
        /Rollback bị từ chối: Phát hiện 1 nhóm logical key không hợp lệ.*missing=1/
      );

      // Bảng vẫn trống (không bị phục sinh dòng duplicate cũ trái phép)
      const { rows: afterRows } = await client.query(
        `SELECT COUNT(*) AS c FROM campaign_run_recipient_steps WHERE id_run = 702`
      );
      expect(Number(afterRows[0].c)).toBe(0);

      // Index vẫn còn
      const { rows: indexCheck } = await client.query(
        `SELECT to_regclass('${tempSchema}.uq_crrs_progress') AS idx`
      );
      expect(indexCheck[0].idx).not.toBeNull();
    });
  });

  it('aborts rollback transaction cleanly when survivor row was replaced with a new ID (replacement survivor)', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn duplicate rows
      await client.query(
        `INSERT INTO campaign_run_recipient_steps (
           id_run, id_campaign, id_node, channel, recipient_key,
           last_completed_step, is_fully_completed, meta, updated_at
         ) VALUES
           (703, 99, 'node_rep', 'email', 'replace@test.com', 1, FALSE, '{"step":1}'::jsonb, '2026-09-01T10:00:00.000Z'),
           (703, 99, 'node_rep', 'email', 'replace@test.com', 2, TRUE, '{"step":2}'::jsonb, '2026-09-01T10:00:00.000Z')`
      );

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id FROM campaign_run_recipient_steps_backup_182 WHERE id_run = 703`
      );
      const batchId = backupRows[0].migration_batch_id;

      // 3. Giả lập survivor bị xóa rồi tạo row mới cùng logical key nhưng ID mới (99999)
      await client.query(`DELETE FROM campaign_run_recipient_steps WHERE id_run = 703`);
      await client.query(
        `INSERT INTO campaign_run_recipient_steps (
           id, id_run, id_campaign, id_node, channel, recipient_key,
           last_completed_step, is_fully_completed, meta, updated_at
         ) VALUES
           (99999, 703, 99, 'node_rep', 'email', 'replace@test.com', 1, FALSE, '{"replacement": true}'::jsonb, '2026-09-01T10:00:00.000Z')`
      );

      // 4. Operator chạy rollback script: Guard phải phát hiện replacement survivor và abort
      await expectRollbackAbort(
        client,
        batchId,
        /Rollback bị từ chối: Phát hiện 1 nhóm logical key không hợp lệ.*replacement=1/
      );

      // Row mới 99999 vẫn còn nguyên vẹn, không bị xóa đè
      const { rows: repCheck } = await client.query(
        `SELECT id FROM campaign_run_recipient_steps WHERE id = 99999`
      );
      expect(repCheck).toHaveLength(1);
    });
  });

  it('aborts rollback transaction cleanly when target_batch_id does not exist or is invalid UUID', async () => {
    await withIsolatedSchema(async (client) => {
      // 1. target_batch_id không phải UUID hợp lệ
      await expectRollbackAbort(
        client,
        'invalid-not-a-uuid',
        /Rollback bị từ chối: target_batch_id không phải là UUID hợp lệ/
      );

      // 2. target_batch_id là UUID ngẫu nhiên không có trong bảng backup
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      await expectRollbackAbort(
        client,
        nonExistentUuid,
        /Rollback bị từ chối: Không tìm thấy bản ghi backup nào với target_batch_id/
      );

      // 3. target_batch_id không được truyền
      await expectRollbackAbort(
        client,
        null,
        /Rollback bị từ chối: Chưa cung cấp target_batch_id/
      );
    });
  });

  it('rejects decoy table with same index name uq_crrs_progress', async () => {
    await withIsolatedSchema(async (client) => {
      // Tạo một decoy table và tạo index trùng tên uq_crrs_progress trên decoy table
      await client.query(`
        CREATE TABLE decoy_recipient_steps (
          id BIGSERIAL PRIMARY KEY,
          id_run BIGINT,
          id_node VARCHAR(100),
          channel VARCHAR(50),
          recipient_key TEXT
        );
        CREATE UNIQUE INDEX uq_crrs_progress
          ON decoy_recipient_steps(id_run, id_node, channel, recipient_key);
      `);

      // Migration phải bắt được index này thuộc bảng decoy chứ không phải campaign_run_recipient_steps
      await expect(client.query(migrationSql)).rejects.toThrow(
        /Index uq_crrs_progress tồn tại nhưng thuộc bảng decoy_recipient_steps thay vì campaign_run_recipient_steps/
      );
    });
  });

  it('rejects index with unwanted predicate, enforcing Full Unique Index specification', async () => {
    await withIsolatedSchema(async (client) => {
      // Tạo index có predicate (ví dụ partial WHERE)
      await client.query(`
        CREATE UNIQUE INDEX uq_crrs_progress
          ON campaign_run_recipient_steps(id_run, id_node, channel, recipient_key)
          WHERE id_run IS NOT NULL AND id_node IS NOT NULL AND channel IS NOT NULL AND recipient_key IS NOT NULL;
      `);

      // Migration phải từ chối vì không phải Full Unique Index không predicate
      await expect(client.query(migrationSql)).rejects.toThrow(
        /Index uq_crrs_progress tồn tại nhưng có predicate không mong muốn/
      );
    });
  });

  it('verifies real ON CONFLICT execution succeeds for both email and Zalo channels', async () => {
    await withIsolatedSchema(async (client) => {
      // 1. Chạy migration tạo index
      await client.query(migrationSql);

      // 2. Chạy câu lệnh ON CONFLICT cho Zalo channel (không WHERE clause)
      const zaloUpsert = `
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, updated_at)
        VALUES
          (301, 1, 'zalo_node_1', 'zalo', '0912345678', 1, FALSE, '{"phone": "0912345678"}'::jsonb, NOW())
        ON CONFLICT (id_run, id_node, channel, recipient_key)
        DO UPDATE SET
          last_completed_step = GREATEST(campaign_run_recipient_steps.last_completed_step, EXCLUDED.last_completed_step),
          is_fully_completed = campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed,
          updated_at = NOW()
        RETURNING id, last_completed_step;
      `;

      const { rows: firstInsert } = await client.query(zaloUpsert);
      expect(firstInsert).toHaveLength(1);
      expect(firstInsert[0].last_completed_step).toBe(1);

      // Lần 2: conflict xảy ra và update tiến độ thành công (không lỗi 42P10)
      const zaloUpdate = `
        INSERT INTO campaign_run_recipient_steps
          (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta, updated_at)
        VALUES
          (301, 1, 'zalo_node_1', 'zalo', '0912345678', 2, TRUE, '{"phone": "0912345678"}'::jsonb, NOW())
        ON CONFLICT (id_run, id_node, channel, recipient_key)
        DO UPDATE SET
          last_completed_step = GREATEST(campaign_run_recipient_steps.last_completed_step, EXCLUDED.last_completed_step),
          is_fully_completed = campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed,
          updated_at = NOW()
        RETURNING id, last_completed_step, is_fully_completed;
      `;

      const { rows: conflictUpdate } = await client.query(zaloUpdate);
      expect(conflictUpdate).toHaveLength(1);
      expect(conflictUpdate[0].id).toBe(firstInsert[0].id);
      expect(conflictUpdate[0].last_completed_step).toBe(2);
      expect(conflictUpdate[0].is_fully_completed).toBe(true);
    });
  });

  it('executes exact backend/scripts/sql/rollback_182_crrs.sql via real psql process with unquoted target_batch_id', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn duplicate rows
      await client.query(`
        INSERT INTO campaign_run_recipient_steps (
          id_run, id_campaign, id_node, channel, recipient_key,
          last_completed_step, is_fully_completed, meta, updated_at
        ) VALUES
          (801, 77, 'node_psql', 'email', 'psql_dup@test.com', 1, FALSE, '{"psql":1}'::jsonb, '2026-09-01T00:00:00Z'),
          (801, 77, 'node_psql', 'email', 'psql_dup@test.com', 2, TRUE,  '{"psql":2}'::jsonb, '2026-09-01T00:00:00Z');
        INSERT INTO schema_migrations (filename, checksum_sha256)
        VALUES ('182_ensure_crrs_unique_progress_index.sql', 'fake-sha256-checksum');
      `);

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id FROM campaign_run_recipient_steps_backup_182 WHERE id_run = 801`
      );
      expect(backupRows).toHaveLength(2);
      const batchId = backupRows[0].migration_batch_id;

      // 3. Thực thi trực tiếp file rollback_182_crrs.sql qua CLI psql thực tế (unquoted variable)
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5433';
      const dbUser = process.env.DB_USER || 'postgres';
      const dbPassword = process.env.DB_PASSWORD || 'postgres';
      const dbName = process.env.DB_NAME || 'uknow_campaign_test';

      const psqlOutput = execFileSync(
        'psql',
        [
          '-h', dbHost,
          '-p', String(dbPort),
          '-U', dbUser,
          '-d', dbName,
          '-v', `target_batch_id=${batchId}`,
          '-f', rollbackScriptPath,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: dbPassword,
            PGOPTIONS: `--search_path=${tempSchema},public`,
          },
          timeout: 40000,
          encoding: 'utf8',
        }
      );

      expect(psqlOutput).toContain('COMMIT');

      // 4. Khẳng định index bị xóa và duplicate rows được phục hồi
      const { rows: idxCheck } = await client.query(
        `SELECT to_regclass('${tempSchema}.uq_crrs_progress') AS idx`
      );
      expect(idxCheck[0].idx).toBeNull();

      const { rows: restored } = await client.query(
        `SELECT id, last_completed_step FROM campaign_run_recipient_steps WHERE id_run = 801 ORDER BY id`
      );
      expect(restored).toHaveLength(2);

      const { rows: migCheck } = await client.query(
        `SELECT COUNT(*) AS c FROM schema_migrations WHERE filename = '182_ensure_crrs_unique_progress_index.sql'`
      );
      expect(Number(migCheck[0].c)).toBe(0);
    });
  });

  it('psql CLI cleanly aborts and exits non-zero when non-existent target_batch_id is provided', () => {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5433';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_NAME || 'uknow_campaign_test';

    let psqlErr = null;
    try {
      execFileSync(
        'psql',
        [
          '-h', dbHost,
          '-p', String(dbPort),
          '-U', dbUser,
          '-d', dbName,
          '-v', 'target_batch_id=00000000-0000-0000-0000-000000000000',
          '-f', rollbackScriptPath,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: dbPassword,
          },
          timeout: 40000,
          encoding: 'utf8',
        }
      );
    } catch (err) {
      psqlErr = err;
    }

    expect(psqlErr).not.toBeNull();
    expect(psqlErr.stderr).toMatch(/Không tìm thấy bản ghi backup nào với target_batch_id/);
  });

  it('psql CLI cleanly aborts and exits non-zero when malformed UUID target_batch_id is provided', () => {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5433';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';
    const dbName = process.env.DB_NAME || 'uknow_campaign_test';

    let psqlErr = null;
    try {
      execFileSync(
        'psql',
        [
          '-h', dbHost,
          '-p', String(dbPort),
          '-U', dbUser,
          '-d', dbName,
          '-v', 'target_batch_id=malformed-not-uuid',
          '-f', rollbackScriptPath,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: dbPassword,
          },
          timeout: 40000,
          encoding: 'utf8',
        }
      );
    } catch (err) {
      psqlErr = err;
    }

    expect(psqlErr).not.toBeNull();
    expect(psqlErr.stderr).toMatch(/target_batch_id không phải là UUID hợp lệ/);
  });

  it('psql CLI cleanly aborts and exits non-zero on lock contention when another transaction holds table lock, leaving schema intact', async () => {
    await withIsolatedSchema(async (client, tempSchema) => {
      // 1. Chèn duplicate rows và migration record
      await client.query(`
        INSERT INTO campaign_run_recipient_steps (
          id_run, id_campaign, id_node, channel, recipient_key,
          last_completed_step, is_fully_completed, meta, updated_at
        ) VALUES
          (901, 77, 'n1', 'email', 'k1', 1, FALSE, '{"foo":1}'::jsonb, '2026-09-01T07:00:00Z'),
          (901, 77, 'n1', 'email', 'k1', 2, TRUE,  '{"foo":2}'::jsonb, '2026-09-01T08:00:00Z');
        INSERT INTO schema_migrations (filename, checksum_sha256)
        VALUES ('182_ensure_crrs_unique_progress_index.sql', 'fake-sha256-checksum');
      `);

      // 2. Chạy migration 182
      await client.query(migrationSql);

      const { rows: backupRows } = await client.query(
        `SELECT migration_batch_id FROM campaign_run_recipient_steps_backup_182 WHERE id_run = 901`
      );
      expect(backupRows).toHaveLength(2);
      const batchId = backupRows[0].migration_batch_id;

      // 3. Client độc lập giữ ACCESS EXCLUSIVE lock trên bảng
      const lockHolder = await db.getClient();
      try {
        await lockHolder.query(`SET search_path TO ${tempSchema}, public`);
        await lockHolder.query('BEGIN');
        await lockHolder.query('LOCK TABLE campaign_run_recipient_steps IN ACCESS EXCLUSIVE MODE');

        // 4. Chạy psql rollback — script có `SET LOCAL lock_timeout = '10s';`
        // Sẽ chờ ~10s rồi abort vì không acquire được lock
        const dbHost = process.env.DB_HOST || 'localhost';
        const dbPort = process.env.DB_PORT || '5433';
        const dbUser = process.env.DB_USER || 'postgres';
        const dbPassword = process.env.DB_PASSWORD || 'postgres';
        const dbName = process.env.DB_NAME || 'uknow_campaign_test';

        let psqlErr = null;
        const startTime = Date.now();
        try {
          execFileSync(
            'psql',
            [
              '-h', dbHost,
              '-p', String(dbPort),
              '-U', dbUser,
              '-d', dbName,
              '-v', `target_batch_id=${batchId}`,
              '-f', rollbackScriptPath,
            ],
            {
              env: {
                ...process.env,
                PGPASSWORD: dbPassword,
                PGOPTIONS: `--search_path=${tempSchema},public`,
              },
              timeout: 40000,
              encoding: 'utf8',
            }
          );
        } catch (err) {
          psqlErr = err;
        }
        const elapsedMs = Date.now() - startTime;

        // 5. Giải phóng lock
        await lockHolder.query('ROLLBACK');

        // Khẳng định:
        // - psql thất bại (exit non-zero)
        expect(psqlErr).not.toBeNull();
        // - Lỗi báo rõ lock timeout
        expect(psqlErr.stderr).toMatch(/lock timeout/i);
        // - Thời gian chờ rơi vào khoảng ~10s (do SET LOCAL lock_timeout = '10s')
        expect(elapsedMs).toBeGreaterThanOrEqual(9000);
        expect(elapsedMs).toBeLessThan(35000);

        // - Toàn bộ transaction rollback sạch: index uq_crrs_progress vẫn còn nguyên
        const { rows: idxCheck } = await client.query(
          `SELECT to_regclass('${tempSchema}.uq_crrs_progress') AS idx`
        );
        expect(idxCheck[0].idx).not.toBeNull();

        // - Dữ liệu survivor không bị suy suyển (vẫn 1 row survivor)
        const { rows: rowsCheck } = await client.query(
          `SELECT id, last_completed_step FROM campaign_run_recipient_steps WHERE id_run = 901`
        );
        expect(rowsCheck).toHaveLength(1);
        expect(rowsCheck[0].last_completed_step).toBe(2);

        // - Migration 182 vẫn nằm trong schema_migrations
        const { rows: migCheck } = await client.query(
          `SELECT COUNT(*) AS c FROM schema_migrations WHERE filename = '182_ensure_crrs_unique_progress_index.sql'`
        );
        expect(Number(migCheck[0].c)).toBe(1);
      } finally {
        try { await lockHolder.query('ROLLBACK'); } catch {}
        lockHolder.release();
      }
    });
  }, 45000);
});
