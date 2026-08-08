/**
 * Migration 101 + insertMessage ON CONFLICT: zalo_personal_messages must not duplicate
 * on (id_zalo_setting, external_id).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import zaloPersonalRepository from '../../src/repositories/chatbot/zaloPersonal.repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_101 = path.resolve(__dirname, '../../migrations/101_zalo_personal_msg_dedupe.sql');

async function createZaloSetting(userId) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
     VALUES ($1, true, 'connected', 'Test Zalo')
     RETURNING id`,
    [userId]
  );
  return rows[0].id;
}

async function createConversation(userId, zaloSettingId, externalId = 'group_1') {
  return zaloPersonalRepository.insertConversation({
    userId,
    zaloSettingId,
    externalId,
    visitorName: 'Nhóm test',
    visitorInfo: JSON.stringify({ is_group: true, group_id: '1' }),
    now: new Date().toISOString(),
  });
}

beforeEach(async () => {
  await truncateAll();
});

describe('zalo_personal_messages dedupe (migration 101)', () => {
  it('insertMessage twice with same external_id keeps one row', async () => {
    const user = await createUser({ username: 'zp-dedupe' });
    const zaloSettingId = await createZaloSetting(user.id);
    const conv = await createConversation(user.id, zaloSettingId);
    const now = new Date().toISOString();
    const params = {
      conversationId: conv.id,
      userId: user.id,
      zaloSettingId,
      role: 'visitor',
      content: 'hello',
      externalId: 'msg_dup_1',
      externalTs: now,
      metadata: '{}',
      createdAt: now,
    };

    const first = await zaloPersonalRepository.insertMessage(params);
    const second = await zaloPersonalRepository.insertMessage(params);

    expect(first).toBeTruthy();
    expect(first.id).toBeTruthy();
    expect(second).toBeUndefined();

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM zalo_personal_messages
       WHERE id_zalo_setting = $1 AND external_id = $2`,
      [zaloSettingId, 'msg_dup_1']
    );
    expect(rows[0].n).toBe(1);
  });

  it('migration 101 is idempotent and cleans duplicates before unique index', async () => {
    const user = await createUser({ username: 'zp-mig-101' });
    const zaloSettingId = await createZaloSetting(user.id);
    const conv = await createConversation(user.id, zaloSettingId, 'group_2');
    const now = new Date().toISOString();

    // Drop unique index if present so we can seed duplicates (bootstrap already has it)
    await db.query(`DROP INDEX IF EXISTS uniq_zalo_personal_msg_external`);

    await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, external_id, created_at)
       VALUES ($1, $2, $3, 'visitor', 'a', 'ext_x', $4),
              ($1, $2, $3, 'visitor', 'b', 'ext_x', $4)`,
      [conv.id, user.id, zaloSettingId, now]
    );

    const sql = fs.readFileSync(MIGRATION_101, 'utf8');
    await db.query(sql);
    await db.query(sql); // second run — idempotent

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM zalo_personal_messages
       WHERE id_zalo_setting = $1 AND external_id = 'ext_x'`,
      [zaloSettingId]
    );
    expect(rows[0].n).toBe(1);

    const { rows: idx } = await db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_zalo_personal_msg_external'`
    );
    expect(idx.length).toBe(1);
  });
});
