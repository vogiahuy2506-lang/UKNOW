import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import { createUser } from './helpers/db.js';
import {
  createReservation,
  findReservationByKey,
  findReservationById,
  transitionReservationState,
  getActiveWalletHolds,
  acquireWorkspaceQuotaLock,
  countEmailSentTodayWithLedger,
  countZaloSentTodayWithLedger,
  countZaloSentInCycleWithLedger,
  countCombinedSentInCycleWithLedger,
  countEmployeeSentTodayWithLedger,
  findExpiredReservations,
  findStaleSendingReservations,
} from '../../src/repositories/sendQuota.repository.js';
import {
  computeRequestFingerprint,
  buildDirectReservationKey,
} from '../../src/services/quota/sendQuotaKey.service.js';
import {
  getVnDayBoundaries,
  reserveSendQuota,
  consumeSendQuota,
} from '../../src/services/quota/sendQuotaReservation.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createTestZaloInboxMessage(client, userId, content = 'Test reply') {
  const { rows: zRows } = await client.query(
    `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
     VALUES ($1, true, 'connected', 'Test Zalo Setting')
     RETURNING id`,
    [userId]
  );
  const zaloSettingId = zRows[0].id;

  const { rows: convRows } = await client.query(
    `INSERT INTO zalo_personal_conversations (
      id_user, id_zalo_setting, external_id, visitor_name, created_at
    ) VALUES (
      $1, $2, $3, 'Test customer', NOW()
    ) RETURNING id`,
    [userId, zaloSettingId, `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`]
  );
  const conversationId = convRows[0].id;

  const { rows: msgRows } = await client.query(
    `INSERT INTO zalo_personal_messages (
      id_conversation, id_user, id_zalo_setting, role, content, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'agent', $4, '{"source":"manual_inbox"}'::jsonb, NOW()
    ) RETURNING id`,
    [conversationId, userId, zaloSettingId, content]
  );

  return { messageId: msgRows[0].id, conversationId, zaloSettingId };
}

describe('PR-Q1: send_quota_reservations Repository & Schema Integration', () => {
  let testUserId;
  const createdReservationIds = [];
  const createdUserIds = [];

  beforeEach(async () => {
    const user = await createUser({
      username: `res_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    });
    testUserId = user.id;
    createdUserIds.push(user.id);
  });

  afterEach(async () => {
    if (createdReservationIds.length > 0) {
      await db.query(
        'DELETE FROM send_quota_reservations WHERE id = ANY($1::bigint[])',
        [createdReservationIds]
      );
      createdReservationIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
      createdUserIds.length = 0;
      testUserId = null;
    }
  });

  it('executes migration 178 on isolated temporary schema proving forward migration and idempotency', async () => {
    const migrationPath = path.resolve(__dirname, '../../migrations/178_send_quota_reservations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const tempSchema = `migration_test_178_${Date.now()}`;
    const client = await db.getClient();
    try {
      // 1. Create clean isolated temporary schema without any 178 structures
      await client.query(`CREATE SCHEMA ${tempSchema}`);
      await client.query(`SET search_path TO ${tempSchema}, public`);

      // Create pre-178 prerequisites in tempSchema: users, user_members, email_messages, zalo_messages, zalo_personal_messages, usage_logs
      await client.query(`
        CREATE TABLE users (
          id BIGSERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user'
        );
        CREATE TABLE user_members (
          id BIGSERIAL PRIMARY KEY,
          owner_id BIGINT REFERENCES users(id),
          user_id BIGINT REFERENCES users(id)
        );
        CREATE TABLE email_messages (
          id BIGSERIAL PRIMARY KEY,
          to_email VARCHAR(255)
        );
        CREATE TABLE zalo_messages (
          id BIGSERIAL PRIMARY KEY,
          message_id VARCHAR(100)
        );
        CREATE TABLE zalo_personal_messages (
          id BIGSERIAL PRIMARY KEY,
          message_id VARCHAR(100)
        );
        CREATE TABLE usage_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT REFERENCES users(id)
        );
      `);

      // Verify table does not exist prior to migration
      const checkPre = await client.query(
        'SELECT to_regclass($1) AS tbl',
        [`${tempSchema}.send_quota_reservations`]
      );
      expect(checkPre.rows[0].tbl).toBeNull();

      // 2. Run first time: PROVES FORWARD MIGRATION creates table, indexes, and columns
      await client.query(sql);

      const checkPost = await client.query(
        'SELECT to_regclass($1) AS tbl',
        [`${tempSchema}.send_quota_reservations`]
      );
      expect(checkPost.rows[0].tbl).not.toBeNull();

      // Verify quota_reservation_id column added to dependent tables
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'email_messages' AND column_name = 'quota_reservation_id'
      `, [tempSchema]);
      expect(colCheck.rows.length).toBe(1);

      // 3. Run second time: PROVES IDEMPOTENCY (IF NOT EXISTS does not error)
      await client.query(sql);

      // Verify row insertion and constraints in the newly migrated table
      await client.query(`
        INSERT INTO users (id, email) VALUES (999, 'test@example.com');
        INSERT INTO send_quota_reservations (
          reservation_key, request_fingerprint, billing_user_id, channel, quantity,
          source_type, status, vn_day_start, vn_day_end
        ) VALUES (
          'key_temp_1', '${'a'.repeat(64)}', 999, 'email', 1,
          'direct', 'reserved', NOW(), NOW() + INTERVAL '1 day'
        );
      `);

      const count = await client.query('SELECT COUNT(*) FROM send_quota_reservations');
      expect(Number(count.rows[0].count)).toBe(1);

      // 4. Assert Indexes created by migration 178
      const indexRes = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'send_quota_reservations'
      `, [tempSchema]);
      const indexNames = indexRes.rows.map((r) => r.indexname);
      expect(indexNames).toContain('idx_sqr_billing_day');
      expect(indexNames).toContain('idx_sqr_billing_cycle');
      expect(indexNames).toContain('idx_sqr_employee');
      expect(indexNames).toContain('idx_sqr_sweeper');
      expect(indexNames).toContain('idx_sqr_wallet');

      // 5. Assert Foreign Key constraints created by migration 178
      const fkRes = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = ($1 || '.send_quota_reservations')::regclass AND contype = 'f'
      `, [tempSchema]);
      const fkNames = fkRes.rows.map((r) => r.conname);
      expect(fkNames).toContain('send_quota_reservations_billing_user_id_fkey');
      expect(fkNames).toContain('send_quota_reservations_actor_user_id_fkey');
      expect(fkNames).toContain('send_quota_reservations_membership_id_fkey');

      // Assert Unique index added to dependent table email_messages
      const depIdxRes = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'email_messages'
      `, [tempSchema]);
      expect(depIdxRes.rows.map((r) => r.indexname)).toContain('uq_em_quota_reservation_id');

      // 6. Assert DB CHECK constraints reject invalid raw SQL INSERTs directly

      // 6a. Reject non-lowercase / non-64 hex fingerprint
      await expect(
        client.query(`
          INSERT INTO send_quota_reservations (
            reservation_key, request_fingerprint, billing_user_id, channel, quantity,
            source_type, status, vn_day_start, vn_day_end
          ) VALUES (
            'key_raw_inv_fp', '${'A'.repeat(64)}', 999, 'email', 1,
            'direct', 'reserved', NOW(), NOW() + INTERVAL '1 day'
          )
        `)
      ).rejects.toThrow(/chk_sqr_fingerprint/);

      // 6b. Reject wallet_item_key not in ('emails', 'zalo_messages')
      await expect(
        client.query(`
          INSERT INTO send_quota_reservations (
            reservation_key, request_fingerprint, billing_user_id, channel, quantity,
            wallet_quantity, wallet_item_key, source_type, status, vn_day_start, vn_day_end
          ) VALUES (
            'key_raw_inv_wallet_item', '${'b'.repeat(64)}', 999, 'email', 10,
            5, 'unsupported_item', 'direct', 'reserved', NOW(), NOW() + INTERVAL '1 day'
          )
        `)
      ).rejects.toThrow(/chk_sqr_wallet_item_key/);

      // 6c. Reject is_metered = false when wallet_quantity > 0
      await expect(
        client.query(`
          INSERT INTO send_quota_reservations (
            reservation_key, request_fingerprint, billing_user_id, channel, quantity,
            is_metered, wallet_quantity, wallet_item_key, source_type, status, vn_day_start, vn_day_end
          ) VALUES (
            'key_raw_inv_metered', '${'c'.repeat(64)}', 999, 'email', 10,
            false, 5, 'emails', 'direct', 'reserved', NOW(), NOW() + INTERVAL '1 day'
          )
        `)
      ).rejects.toThrow(/chk_sqr_metered_wallet/);

      // 6d. Reject response_snapshot > 4096 bytes
      await expect(
        client.query(`
          INSERT INTO send_quota_reservations (
            reservation_key, request_fingerprint, billing_user_id, channel, quantity,
            source_type, status, vn_day_start, vn_day_end, response_snapshot
          ) VALUES (
            'key_raw_inv_snapshot', '${'d'.repeat(64)}', 999, 'email', 1,
            'direct', 'reserved', NOW(), NOW() + INTERVAL '1 day',
            jsonb_build_object('leak', repeat('x', 4500))
          )
        `)
      ).rejects.toThrow(/chk_sqr_response_snapshot_size/);
    } finally {
      try {
        await client.query('RESET search_path');
        await client.query(`DROP SCHEMA IF EXISTS ${tempSchema} CASCADE`);
      } catch (_) {}
      client.release();
    }
  });

  it('inserts reservation and enforces unique reservation_key and check constraints', async () => {
    const client = await db.getClient();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
      const payload = {
        channel: 'email',
        recipient: 'recipient@example.com',
        content: 'Test email body',
        quantity: 1,
        sourceType: 'direct',
      };
      const fingerprint = computeRequestFingerprint(payload);
      const resKey = buildDirectReservationKey({
        channel: 'email',
        billingUserId: testUserId,
        clientKey: `test_key_${Date.now()}`,
        recipient: payload.recipient,
      });

      const created = await createReservation(client, {
        reservationKey: resKey,
        requestFingerprint: fingerprint,
        billingUserId: testUserId,
        channel: 'email',
        quantity: 1,
        sourceType: 'direct',
        vnDayStart,
        vnDayEnd,
      });

      createdReservationIds.push(created.id);
      expect(created.id).toBeDefined();
      expect(created.status).toBe('reserved');
      expect(created.request_fingerprint).toBe(fingerprint);
      expect(created.fingerprint_version).toBe('v1');
      expect(created.is_metered).toBe(true);

      // Attempt duplicate reservation_key -> violates unique constraint
      await expect(
        createReservation(client, {
          reservationKey: resKey,
          requestFingerprint: fingerprint,
          billingUserId: testUserId,
          channel: 'email',
          quantity: 1,
          sourceType: 'direct',
          vnDayStart,
          vnDayEnd,
        })
      ).rejects.toThrow();

      await client.query('COMMIT');
      inTransaction = false;
    } finally {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      client.release();
    }
  });

  it('enforces check constraints: invalid channel, invalid status, or wallet_quantity > quantity', async () => {
    const client = await db.getClient();
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
    const validFp = 'a'.repeat(64);

    // Invalid channel
    await expect(
      createReservation(client, {
        reservationKey: `res_bad_channel_${Date.now()}`,
        requestFingerprint: validFp,
        billingUserId: testUserId,
        channel: 'sms',
        quantity: 1,
        sourceType: 'direct',
        vnDayStart,
        vnDayEnd,
      })
    ).rejects.toThrow();

    // Invalid status
    await expect(
      createReservation(client, {
        reservationKey: `res_bad_status_${Date.now()}`,
        requestFingerprint: validFp,
        billingUserId: testUserId,
        channel: 'email',
        quantity: 1,
        status: 'completed',
        sourceType: 'direct',
        vnDayStart,
        vnDayEnd,
      })
    ).rejects.toThrow();

    // wallet_quantity > quantity
    await expect(
      createReservation(client, {
        reservationKey: `res_bad_wallet_${Date.now()}`,
        requestFingerprint: validFp,
        billingUserId: testUserId,
        channel: 'email',
        quantity: 1,
        walletQuantity: 2,
        walletItemKey: 'emails',
        sourceType: 'direct',
        vnDayStart,
        vnDayEnd,
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_WALLET_QUANTITY',
    });

    client.release();
  });

  it('supports acquireWorkspaceQuotaLock and lifecycle transitions on real DB', async () => {
    const client = await db.getClient();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      await acquireWorkspaceQuotaLock(client, testUserId);

      const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
      const resKey = buildDirectReservationKey({
        channel: 'zalo',
        billingUserId: testUserId,
        clientKey: `life_${Date.now()}`,
        recipient: '0901234567',
      });
      const created = await createReservation(client, {
        reservationKey: resKey,
        requestFingerprint: 'b'.repeat(64),
        billingUserId: testUserId,
        channel: 'zalo',
        quantity: 1,
        sourceType: 'direct',
        vnDayStart,
        vnDayEnd,
      });
      createdReservationIds.push(created.id);

      // Transition 1: reserved -> sending
      const sendingRow = await transitionReservationState(
        client,
        created.id,
        'reserved',
        'sending',
        { providerReference: 'provider_ref_1' }
      );
      expect(sendingRow.status).toBe('sending');
      expect(sendingRow.sending_at).toBeTruthy();
      expect(sendingRow.provider_reference).toBe('provider_ref_1');

      // Transition 2: sending -> consumed
      const snapshot = { messageId: 'msg_success_1', sentAt: new Date().toISOString() };
      const consumedRow = await transitionReservationState(
        client,
        created.id,
        'sending',
        'consumed',
        { responseSnapshot: snapshot }
      );
      expect(consumedRow.status).toBe('consumed');
      expect(consumedRow.consumed_at).toBeTruthy();
      expect(consumedRow.response_snapshot).toEqual(snapshot);

      // Idempotent duplicate call -> returns same row
      const idempotentRow = await transitionReservationState(
        client,
        created.id,
        'consumed',
        'consumed'
      );
      expect(idempotentRow.status).toBe('consumed');

      // Illegal transition from terminal state consumed -> released
      await expect(
        transitionReservationState(client, created.id, 'consumed', 'released')
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_RESERVATION_TRANSITION',
      });

      await client.query('COMMIT');
      inTransaction = false;
    } finally {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      client.release();
    }
  });

  it('calculates active wallet holds and ledger counts correctly, including zalo_personal_messages', async () => {
    const client = await db.getClient();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
      const now = new Date();
      const cycleStart = new Date(now.getTime() - 86400000);
      const cycleEnd = new Date(now.getTime() + 86400000 * 25);

      // Reservation 1: email, quantity=5, wallet_quantity=3, status='reserved'
      const r1 = await createReservation(client, {
        reservationKey: `res_hold_1_${Date.now()}`,
        requestFingerprint: '1'.repeat(64),
        billingUserId: testUserId,
        channel: 'email',
        quantity: 5,
        walletItemKey: 'emails',
        walletQuantity: 3,
        sourceType: 'campaign',
        status: 'reserved',
        vnDayStart,
        vnDayEnd,
        cycleStart,
        cycleEnd,
      });
      createdReservationIds.push(r1.id);

      // Reservation 2: zalo, quantity=2, wallet_quantity=2, status='uncertain'
      const r2 = await createReservation(client, {
        reservationKey: `res_hold_2_${Date.now()}`,
        requestFingerprint: '2'.repeat(64),
        billingUserId: testUserId,
        channel: 'zalo',
        quantity: 2,
        walletItemKey: 'zalo_messages',
        walletQuantity: 2,
        sourceType: 'campaign',
        status: 'uncertain',
        vnDayStart,
        vnDayEnd,
        cycleStart,
        cycleEnd,
      });
      createdReservationIds.push(r2.id);

      // Seed legacy zalo_personal_message (manual inbox) for testUserId
      const { messageId: zpmId, conversationId: convId, zaloSettingId: zsId } =
        await createTestZaloInboxMessage(client, testUserId, 'Hello customer');

      // Active email wallet holds = 3
      const emailHolds = await getActiveWalletHolds(client, testUserId, 'emails');
      expect(emailHolds).toBe(3);

      // Active zalo wallet holds = 2
      const zaloHolds = await getActiveWalletHolds(client, testUserId, 'zalo_messages');
      expect(zaloHolds).toBe(2);

      // Ledger count in day = 5 (reserved email)
      const dailyEmail = await countEmailSentTodayWithLedger(client, testUserId, vnDayStart, vnDayEnd);
      expect(dailyEmail).toBe(5);

      // Ledger count for Zalo in day = 2 (uncertain reservation) + 1 (legacy inbox message) = 3
      const dailyZalo = await countZaloSentTodayWithLedger(client, testUserId, vnDayStart, vnDayEnd);
      expect(dailyZalo).toBe(3);

      // Combined in cycle = 5 email + 3 zalo = 8
      const cycleCombined = await countCombinedSentInCycleWithLedger(client, testUserId, cycleStart, cycleEnd);
      expect(cycleCombined).toBe(8);

      // Clean up seeded zpm
      await client.query('DELETE FROM zalo_personal_messages WHERE id = $1', [zpmId]);
      await client.query('DELETE FROM zalo_personal_conversations WHERE id = $1', [convId]);
      await client.query('DELETE FROM zalo_settings WHERE id = $1', [zsId]);

      await client.query('COMMIT');
      inTransaction = false;
    } finally {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      client.release();
    }
  });

  it('counts employee sends with ledger without SQL error (c.created_by, zpm, usage_logs, reservations)', async () => {
    const employee = await createUser({
      username: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    });
    createdUserIds.push(employee.id);

    const client = await db.getClient();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const { vnDayStart, vnDayEnd } = getVnDayBoundaries();

      // 1. Employee Email Reservation
      const empEmailRes = await createReservation(client, {
        reservationKey: `emp_res_email_${Date.now()}`,
        requestFingerprint: '3'.repeat(64),
        billingUserId: testUserId,
        actorUserId: employee.id,
        channel: 'email',
        quantity: 3,
        sourceType: 'direct',
        status: 'reserved',
        vnDayStart,
        vnDayEnd,
      });
      createdReservationIds.push(empEmailRes.id);

      // 2. Employee Zalo Reservation
      const empZaloRes = await createReservation(client, {
        reservationKey: `emp_res_zalo_${Date.now()}`,
        requestFingerprint: '4'.repeat(64),
        billingUserId: testUserId,
        actorUserId: employee.id,
        channel: 'zalo',
        quantity: 2,
        sourceType: 'direct',
        status: 'sending',
        vnDayStart,
        vnDayEnd,
      });
      createdReservationIds.push(empZaloRes.id);

      // 3. Employee Zalo inbox message
      const { messageId: empZpmId, conversationId: empConvId, zaloSettingId: empZsId } =
        await createTestZaloInboxMessage(client, employee.id, 'Reply from employee');

      // Crucial test: countEmployeeSentTodayWithLedger must execute cleanly without SQL column errors
      const emailCount = await countEmployeeSentTodayWithLedger(
        client,
        testUserId,
        employee.id,
        'email',
        vnDayStart,
        vnDayEnd
      );
      expect(emailCount).toBe(3);

      const zaloCount = await countEmployeeSentTodayWithLedger(
        client,
        testUserId,
        employee.id,
        'zalo',
        vnDayStart,
        vnDayEnd
      );
      expect(zaloCount).toBe(3); // 2 reservation + 1 inbox message

      await client.query('DELETE FROM zalo_personal_messages WHERE id = $1', [empZpmId]);
      await client.query('DELETE FROM zalo_personal_conversations WHERE id = $1', [empConvId]);
      await client.query('DELETE FROM zalo_settings WHERE id = $1', [empZsId]);

      await client.query('COMMIT');
      inTransaction = false;
    } finally {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      client.release();
    }
  });

  it('runs reserveSendQuota and consumeSendQuota with billing cycle snapshot and idempotency under test_enforce', async () => {
    const payload = {
      channel: 'email',
      recipient: 'customer@example.com',
      subject: 'Welcome',
      content: 'Welcome to our service',
      quantity: 1,
      sourceType: 'direct',
    };
    const resKey = buildDirectReservationKey({
      channel: 'email',
      billingUserId: testUserId,
      clientKey: `idem_${Date.now()}`,
      recipient: payload.recipient,
    });

    // 1. Initial reservation: verifies cycle_start and cycle_end are populated
    const reserved = await reserveSendQuota(
      {
        userId: testUserId,
        channel: 'email',
        quantity: 1,
        reservationKey: resKey,
        requestPayload: payload,
      },
      { modeOverride: 'test_enforce' }
    );
    createdReservationIds.push(reserved.id);

    expect(reserved.id).toBeDefined();
    expect(reserved.status).toBe('reserved');
    // Crucial P1 assertion: cycle_start and cycle_end must NOT be null for user with plan
    expect(reserved.cycle_start).not.toBeNull();
    expect(reserved.cycle_end).not.toBeNull();
    const cycleStartDate = new Date(reserved.cycle_start);
    const cycleEndDate = new Date(reserved.cycle_end);
    expect(isNaN(cycleStartDate.getTime())).toBe(false);
    expect(isNaN(cycleEndDate.getTime())).toBe(false);
    expect(cycleStartDate.getTime()).toBeLessThan(cycleEndDate.getTime());

    // 2. Duplicate reservation with same payload: returns replayed reservation
    const replayed = await reserveSendQuota(
      {
        userId: testUserId,
        channel: 'email',
        quantity: 1,
        reservationKey: resKey,
        requestPayload: payload,
      },
      { modeOverride: 'test_enforce' }
    );
    expect(replayed.id).toBe(reserved.id);
    expect(replayed.replayed).toBe(true);

    // 3. Duplicate reservation with modified payload: throws 409 IDEMPOTENCY_KEY_REUSED
    await expect(
      reserveSendQuota(
        {
          userId: testUserId,
          channel: 'email',
          quantity: 1,
          reservationKey: resKey,
          requestPayload: { ...payload, content: 'Tampered content' },
        },
        { modeOverride: 'test_enforce' }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    // 4. Transition to sending
    await db.query(
      `UPDATE send_quota_reservations
       SET status = 'sending', sending_at = NOW()
       WHERE id = $1`,
      [reserved.id]
    );

    // 5. Consume reservation: persistSource callback executed once
    const mockPersist = jest.fn();
    const consumed = await consumeSendQuota(
      {
        reservationId: reserved.id,
        persistSource: mockPersist,
        responseSnapshot: { messageId: 'msg_987', status: 'delivered' },
      },
      { modeOverride: 'test_enforce' }
    );
    expect(consumed.status).toBe('consumed');
    expect(mockPersist).toHaveBeenCalledTimes(1);

    // 6. Consume replay: when already consumed, persistSource must NOT be executed again
    const reConsumed = await consumeSendQuota(
      {
        reservationId: reserved.id,
        persistSource: mockPersist,
      },
      { modeOverride: 'test_enforce' }
    );
    expect(reConsumed.status).toBe('consumed');
    expect(mockPersist).toHaveBeenCalledTimes(1); // Still 1, not called second time!
  });

  it('sweeper queries use FOR UPDATE SKIP LOCKED and skip locked rows concurrently', async () => {
    const client1 = await db.getClient();
    const client2 = await db.getClient();
    let tx1 = false;
    let tx2 = false;

    try {
      const { vnDayStart, vnDayEnd } = getVnDayBoundaries();
      const pastTime = new Date(Date.now() - 3600 * 1000);

      // Insert 2 expired reservations
      const rExpired1 = await createReservation(db, {
        reservationKey: `res_sweeper_exp1_${Date.now()}`,
        requestFingerprint: '1'.repeat(64),
        billingUserId: testUserId,
        channel: 'email',
        quantity: 1,
        sourceType: 'direct',
        status: 'reserved',
        vnDayStart,
        vnDayEnd,
        expiresAt: pastTime,
      });
      const rExpired2 = await createReservation(db, {
        reservationKey: `res_sweeper_exp2_${Date.now()}`,
        requestFingerprint: '2'.repeat(64),
        billingUserId: testUserId,
        channel: 'email',
        quantity: 1,
        sourceType: 'direct',
        status: 'reserved',
        vnDayStart,
        vnDayEnd,
        expiresAt: pastTime,
      });
      createdReservationIds.push(rExpired1.id, rExpired2.id);

      // Client 1 begins transaction and fetches/locks 1 expired reservation
      await client1.query('BEGIN');
      tx1 = true;
      const list1 = await findExpiredReservations(client1, 1);
      expect(list1).toHaveLength(1);
      const lockedId = list1[0].id;

      // Client 2 begins transaction concurrently and fetches 1 expired reservation
      // Because client 1 holds lock on lockedId, client 2's SKIP LOCKED must skip it and return the other!
      await client2.query('BEGIN');
      tx2 = true;
      const list2 = await findExpiredReservations(client2, 1);
      expect(list2).toHaveLength(1);
      expect(list2[0].id).not.toBe(lockedId);

      await client1.query('COMMIT');
      tx1 = false;
      await client2.query('COMMIT');
      tx2 = false;
    } finally {
      if (tx1) {
        try { await client1.query('ROLLBACK'); } catch (_) {}
      }
      if (tx2) {
        try { await client2.query('ROLLBACK'); } catch (_) {}
      }
      client1.release();
      client2.release();
    }
  });
});
