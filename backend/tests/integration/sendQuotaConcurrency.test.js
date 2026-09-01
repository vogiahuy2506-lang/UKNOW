import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  getVnDayBoundaries,
  getShadowMismatchMetrics,
  resetShadowMismatchMetrics,
} from '../../src/services/quota/sendQuotaReservation.service.js';
import {
  countEmailSentTodayWithLedger,
  getWalletAvailableBalance,
  acquireWorkspaceQuotaLock,
} from '../../src/repositories/sendQuota.repository.js';
import { buildDirectReservationKey } from '../../src/services/quota/sendQuotaKey.service.js';

describe('PR-Q2: Atomic Send Quota Decision Engine & Concurrency Integration', () => {
  beforeEach(async () => {
    resetShadowMismatchMetrics();
    await truncateAll();
  });

  afterEach(async () => {
    resetShadowMismatchMetrics();
    await truncateAll();
  });

  /**
   * Helper to create a test plan with custom limits and assign to user
   */
  async function createTestPlan(limits = {}) {
    const {
      name = `Plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dailyEmail = null,
      monthlyEmail = null,
      dailyZalo = null,
      monthlyZalo = null,
      messagesPerPeriod = null,
    } = limits;

    const { rows } = await db.query(
      `INSERT INTO plans (
        name, price,
        daily_email_limit, monthly_email_limit,
        daily_zalo_limit, monthly_zalo_limit,
        messages_per_period, is_active
      ) VALUES (
        $1, 100000,
        $2, $3, $4, $5, $6, true
      ) RETURNING *`,
      [name, dailyEmail, monthlyEmail, dailyZalo, monthlyZalo, messagesPerPeriod]
    );
    return rows[0];
  }

  async function assignPlanToUser(userId, planId) {
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $2`,
      [planId, userId]
    );
  }

  it('1. 20 concurrent unique requests competing for 1 remaining slot -> exactly 1 allowed', async () => {
    const plan = await createTestPlan({ dailyEmail: 1 });
    const user = await createUser({ username: `race_user_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const concurrency = 20;
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      const recipient = `user${i}@example.com`;
      const key = buildDirectReservationKey({
        channel: 'email',
        billingUserId: user.id,
        clientKey: `key_race_${i}`,
        recipient,
      });
      promises.push(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: key,
            requestPayload: { channel: 'email', recipient, idx: i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.allowed).toBe(true);
    expect(fulfilled[0].value.status).toBe('reserved');

    expect(rejected).toHaveLength(19);
    for (const r of rejected) {
      expect(r.reason.status).toBe(403);
      expect(r.reason.code).toBe('RESOURCE_LIMIT_EXCEEDED');
      expect(r.reason.limitType).toBe('daily');
    }

    const { rows: resRows } = await db.query(
      'SELECT id, status FROM send_quota_reservations WHERE billing_user_id = $1',
      [user.id]
    );
    expect(resRows).toHaveLength(1);
    expect(resRows[0].status).toBe('reserved');
  });

  it('2. 20 concurrent replays with identical idempotency key -> exactly 1 reservation created, all 20 succeed', async () => {
    const plan = await createTestPlan({ dailyEmail: 10 });
    const user = await createUser({ username: `replay_user_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const recipient = 'same@example.com';
    const idempotencyKey = buildDirectReservationKey({
      channel: 'email',
      billingUserId: user.id,
      clientKey: 'stable_client_key_123',
      recipient,
    });
    const payload = { channel: 'email', recipient, text: 'hello' };

    const concurrency = 20;
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: idempotencyKey,
            requestPayload: payload,
          },
          { modeOverride: 'test_enforce' }
        )
      );
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(rejected).toHaveLength(0);
    expect(fulfilled).toHaveLength(20);

    const firstId = fulfilled[0].value.id;
    for (const r of fulfilled) {
      expect(r.value.id).toBe(firstId);
      expect(r.value.allowed).toBe(true);
    }

    const { rows: resRows } = await db.query(
      'SELECT id, reservation_key FROM send_quota_reservations WHERE billing_user_id = $1',
      [user.id]
    );
    expect(resRows).toHaveLength(1);
    expect(resRows[0].id).toBe(firstId);
  });

  it('3. Employee limit is lower than workspace limit -> employee limit wins', async () => {
    const plan = await createTestPlan({ dailyEmail: 100 });
    const owner = await createUser({ username: `owner_${Date.now()}` });
    await assignPlanToUser(owner.id, plan.id);

    const employee = await createUser({ username: `emp_${Date.now()}` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, daily_email_limit)
       VALUES ($1, $2, 'active', 2)`,
      [owner.id, employee.id]
    );

    const res1 = await reserveSendQuota(
      {
        userId: employee.id,
        actorUserId: employee.id,
        ownerContextId: owner.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: owner.id,
          clientKey: 'emp_key_1',
          recipient: 'one@test.vn',
        }),
        requestPayload: { recipient: 'one@test.vn' },
      },
      { modeOverride: 'test_enforce' }
    );
    expect(res1.allowed).toBe(true);

    const res2 = await reserveSendQuota(
      {
        userId: employee.id,
        actorUserId: employee.id,
        ownerContextId: owner.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: owner.id,
          clientKey: 'emp_key_2',
          recipient: 'two@test.vn',
        }),
        requestPayload: { recipient: 'two@test.vn' },
      },
      { modeOverride: 'test_enforce' }
    );
    expect(res2.allowed).toBe(true);

    await expect(
      reserveSendQuota(
        {
          userId: employee.id,
          actorUserId: employee.id,
          ownerContextId: owner.id,
          channel: 'email',
          quantity: 1,
          reservationKey: buildDirectReservationKey({
            channel: 'email',
            billingUserId: owner.id,
            clientKey: 'emp_key_3',
            recipient: 'three@test.vn',
          }),
          requestPayload: { recipient: 'three@test.vn' },
        },
        { modeOverride: 'test_enforce' }
      )
    ).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limitType: 'employee',
      limit: 2,
      currentCount: 2,
    });
  });

  it('4. Two employees competing for workspace slot -> total cannot exceed workspace limit', async () => {
    const plan = await createTestPlan({ dailyEmail: 2 });
    const owner = await createUser({ username: `owner_comp_${Date.now()}` });
    await assignPlanToUser(owner.id, plan.id);

    const emp1 = await createUser({ username: `emp1_${Date.now()}` });
    const emp2 = await createUser({ username: `emp2_${Date.now()}` });

    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, daily_email_limit)
       VALUES ($1, $2, 'active', 10), ($1, $3, 'active', 10)`,
      [owner.id, emp1.id, emp2.id]
    );

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        reserveSendQuota(
          {
            userId: emp1.id,
            actorUserId: emp1.id,
            ownerContextId: owner.id,
            channel: 'email',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'email',
              billingUserId: owner.id,
              clientKey: `e1_k_${i}`,
              recipient: `e1_rec_${i}@test.vn`,
            }),
            requestPayload: { emp: 1, idx: i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
      promises.push(
        reserveSendQuota(
          {
            userId: emp2.id,
            actorUserId: emp2.id,
            ownerContextId: owner.id,
            channel: 'email',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'email',
              billingUserId: owner.id,
              clientKey: `e2_k_${i}`,
              recipient: `e2_rec_${i}@test.vn`,
            }),
            requestPayload: { emp: 2, idx: i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(18);

    const { rows: resRows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM send_quota_reservations WHERE billing_user_id = $1',
      [owner.id]
    );
    expect(resRows[0].total).toBe(2);
  });

  it('5. Email + Zalo competing for combined period slot -> total cannot exceed messages_per_period', async () => {
    const plan = await createTestPlan({ messagesPerPeriod: 3 });
    const user = await createUser({ username: `user_comb_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'email',
              billingUserId: user.id,
              clientKey: `em_comb_${i}`,
              recipient: `em_${i}@test.vn`,
            }),
            requestPayload: { type: 'email', i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
      promises.push(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'zalo',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'zalo',
              billingUserId: user.id,
              clientKey: `za_comb_${i}`,
              recipient: `090000000${i}`,
            }),
            requestPayload: { type: 'zalo', i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(7);

    for (const r of rejected) {
      expect(r.reason.limitType).toBe('period');
      expect(r.reason.limit).toBe(3);
    }
  });

  it('6. Monthly plan exhausted, wallet balance = 2 -> exactly 2 wallet holds and debits on consume', async () => {
    const plan = await createTestPlan({ monthlyEmail: 2 });
    const user = await createUser({ username: `user_topup_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    // Consume 2 monthly plan quota via direct reservation + consume
    const resA = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'pre_init_1',
          recipient: 'pre1@test.vn',
        }),
        requestPayload: { pre: 1 },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: resA.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: resA.id }, { modeOverride: 'test_enforce' });

    const resB = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'pre_init_2',
          recipient: 'pre2@test.vn',
        }),
        requestPayload: { pre: 2 },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: resB.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: resB.id }, { modeOverride: 'test_enforce' });

    // Create an order first for FK
    const orderCode = Date.now() + Math.floor(Math.random() * 1000000);
    const { rows: ordRows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount)
       VALUES ($1, $2, 'success', 50000)
       RETURNING id`,
      [user.id, orderCode]
    );
    const orderId = ordRows[0].id;

    // Grant 2 email topups into user's wallet
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, 'emails', 2, $2, NULL)`,
      [user.id, orderId]
    );

    const initialWallet = await getWalletAvailableBalance(db, user.id, 'emails');
    expect(initialWallet.available).toBe(2);

    // 5 concurrent requests competing for the 2 wallet units
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'email',
              billingUserId: user.id,
              clientKey: `topup_req_${i}`,
              recipient: `top_${i}@test.vn`,
            }),
            requestPayload: { topupSend: i },
          },
          { modeOverride: 'test_enforce' }
        )
      );
    }

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(3);

    for (const r of fulfilled) {
      expect(r.value.wallet_quantity).toBe(1);
      expect(r.value.wallet_item_key).toBe('emails');
    }

    for (const r of rejected) {
      expect(r.reason.limitType).toBe('monthly');
    }

    // Consume both reservations -> verify sourceKey format is quota_reservation:<id>
    for (const r of fulfilled) {
      await markSendQuotaSending({ reservationId: r.value.id }, { modeOverride: 'test_enforce' });
      await consumeSendQuota({ reservationId: r.value.id }, { modeOverride: 'test_enforce' });
    }

    const { rows: usageRows } = await db.query(
      'SELECT id, qty, source_key FROM topup_debits WHERE user_id = $1 AND item_key = $2',
      [user.id, 'emails']
    );
    expect(usageRows).toHaveLength(2);
    for (const row of usageRows) {
      expect(row.source_key).toMatch(/^quota_reservation:\d+$/);
    }

    // Replay consume -> idempotent
    await consumeSendQuota({ reservationId: fulfilled[0].value.id }, { modeOverride: 'test_enforce' });
    const { rows: usageRowsAfterReplay } = await db.query(
      'SELECT id FROM topup_debits WHERE user_id = $1 AND item_key = $2',
      [user.id, 'emails']
    );
    expect(usageRowsAfterReplay).toHaveLength(2);

    const finalWallet = await getWalletAvailableBalance(db, user.id, 'emails');
    expect(finalWallet.available).toBe(0);
  });

  it('7. Rollback safety: uncommitted reservation leaves zero dangling reservation/usage/wallet hold', async () => {
    const plan = await createTestPlan({ dailyEmail: 10 });
    const user = await createUser({ username: `user_rollback_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await reserveSendQuota(
        {
          userId: user.id,
          channel: 'email',
          quantity: 1,
          reservationKey: buildDirectReservationKey({
            channel: 'email',
            billingUserId: user.id,
            clientKey: 'rollback_key_1',
            recipient: 'rb@test.vn',
          }),
          requestPayload: { test: 'rollback' },
        },
        { queryableClient: client, modeOverride: 'test_enforce' }
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const { rows: resRows } = await db.query(
      'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
      [user.id]
    );
    expect(resRows).toHaveLength(0);

    const count = await countEmailSentTodayWithLedger(
      db,
      user.id,
      getVnDayBoundaries().vnDayStart,
      getVnDayBoundaries().vnDayEnd
    );
    expect(count).toBe(0);
  });

  it('8. Zero double-counting for rows with linked quota_reservation_id', async () => {
    const plan = await createTestPlan({ dailyEmail: 10 });
    const user = await createUser({ username: `user_dbl_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const res = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'dblcount_key_1',
          recipient: 'dbl@test.vn',
        }),
        requestPayload: { test: 'dbl' },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: res.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: res.id }, { modeOverride: 'test_enforce' });

    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'Dbl Campaign', 'email', 'completed')
       RETURNING id`,
      [user.id]
    );
    const campaignId = cRows[0].id;

    await db.query(
      `INSERT INTO email_messages (
        id_campaign, recipient_email, status, sent_at, quota_reservation_id
      ) VALUES ($1, 'test@example.com', 'sent', NOW(), $2)`,
      [campaignId, res.id]
    );

    const count = await countEmailSentTodayWithLedger(
      db,
      user.id,
      getVnDayBoundaries().vnDayStart,
      getVnDayBoundaries().vnDayEnd
    );
    expect(count).toBe(1);
  });

  it('9. Shadow Mode parity & multidimensional metrics: evaluates decision without writing to DB, never blocks legacy', async () => {
    const plan = await createTestPlan({ dailyEmail: 1 });
    const user = await createUser({ username: `user_shadow_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    resetShadowMismatchMetrics();

    // Case A: Legacy allows and atomic allows -> match
    const resA = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'shadow_key_a',
          recipient: 'shadow_a@test.vn',
        }),
        requestPayload: { test: 'shadow_a' },
      },
      { modeOverride: 'shadow' }
    );

    expect(resA.mode).toBe('shadow');
    expect(resA.allowed).toBe(true);
    expect(resA.shadowAllowed).toBe(true);
    expect(resA.shadowMismatch).toBe(false);

    // Verify 0 rows in DB (shadow mode does not write)
    const { rows: resRows } = await db.query(
      'SELECT * FROM send_quota_reservations WHERE billing_user_id = $1',
      [user.id]
    );
    expect(resRows).toHaveLength(0);

    const metrics = getShadowMismatchMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.mismatches).toBe(0);
    expect(metrics.legacy_allow_atomic_deny).toBe(0);
  });

  it('10. VN Timezone and billing cycle boundary enforcement against real database timestamps', async () => {
    const plan = await createTestPlan({ dailyEmail: 2, monthlyEmail: 1 });
    const user = await createUser({ username: `user_tz_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'TZ Campaign', 'email', 'completed')
       RETURNING id`,
      [user.id]
    );
    const campaignId = cRows[0].id;

    // 1. Insert an email sent in the previous billing cycle (45 days ago)
    const pastCycleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at)
       VALUES ($1, 'past_cycle@test.vn', 'sent', $2)`,
      [campaignId, pastCycleDate]
    );

    // 2. Insert an email sent yesterday before Vietnam midnight (23:50 VN yesterday)
    const { vnDayStart } = getVnDayBoundaries();
    const yesterdaySentAt = new Date(vnDayStart.getTime() - 10 * 60 * 1000);
    await db.query(
      `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at)
       VALUES ($1, 'past_day@test.vn', 'sent', $2)`,
      [campaignId, yesterdaySentAt]
    );

    // 3. Send today should succeed because previous cycle and yesterday sends are outside current window
    const resToday1 = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'today_key_1',
          recipient: 'today1@test.vn',
        }),
        requestPayload: { t: 1 },
      },
      { modeOverride: 'test_enforce' }
    );
    expect(resToday1.allowed).toBe(true);
    await markSendQuotaSending({ reservationId: resToday1.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: resToday1.id }, { modeOverride: 'test_enforce' });

    // 4. Second send today succeeds for daily (daily limit = 2), but FAILS on monthly limit (monthly limit = 1)
    await expect(
      reserveSendQuota(
        {
          userId: user.id,
          channel: 'email',
          quantity: 1,
          reservationKey: buildDirectReservationKey({
            channel: 'email',
            billingUserId: user.id,
            clientKey: 'today_key_2',
            recipient: 'today2@test.vn',
          }),
          requestPayload: { t: 2 },
        },
        { modeOverride: 'test_enforce' }
      )
    ).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limitType: 'monthly',
      limit: 1,
      currentCount: 1,
    });
  });

  it('11. Real PostgreSQL advisory lock contention and lock_timeout maps to HTTP 503 SEND_QUOTA_UNAVAILABLE', async () => {
    const plan = await createTestPlan({ dailyEmail: 10 });
    const user = await createUser({ username: `user_lock_real_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    const clientHolder = await db.getClient();
    const clientContender = await db.getClient();

    try {
      // 1. clientHolder acquires exclusive workspace advisory lock in a transaction
      await clientHolder.query('BEGIN');
      await acquireWorkspaceQuotaLock(clientHolder, user.id);

      // 2. clientContender sets aggressive lock_timeout (200ms)
      await clientContender.query('BEGIN');
      await clientContender.query("SET LOCAL lock_timeout = '200ms'");

      // 3. clientContender attempts to reserveSendQuota on the locked workspace
      await expect(
        reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: buildDirectReservationKey({
              channel: 'email',
              billingUserId: user.id,
              clientKey: 'real_lock_contend_k',
              recipient: 'contend@test.vn',
            }),
            requestPayload: { test: 'real_lock' },
          },
          { queryableClient: clientContender, modeOverride: 'test_enforce' }
        )
      ).rejects.toMatchObject({
        status: 503,
        code: 'SEND_QUOTA_UNAVAILABLE',
      });

      await clientContender.query('ROLLBACK');
    } finally {
      try {
        await clientHolder.query('ROLLBACK');
      } catch (_) {}
      clientHolder.release();
      clientContender.release();
    }
  });

  it('12. Rollback safety: callback persistSource failure rolls back both message persistence and wallet debit', async () => {
    const plan = await createTestPlan({ monthlyEmail: 1 });
    const user = await createUser({ username: `user_rollback_full_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    // Consume plan monthly quota
    const preRes = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'pre_exhaust_k',
          recipient: 'pre_ex@test.vn',
        }),
        requestPayload: { pre: 1 },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: preRes.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: preRes.id }, { modeOverride: 'test_enforce' });

    // Grant 1 wallet unit
    const orderCode = Date.now() + Math.floor(Math.random() * 1000000);
    const { rows: ordRows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount)
       VALUES ($1, $2, 'success', 50000)
       RETURNING id`,
      [user.id, orderCode]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, 'emails', 1, $2, NULL)`,
      [user.id, ordRows[0].id]
    );

    // Create campaign for message persistence
    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'Failing Campaign', 'email', 'processing')
       RETURNING id`,
      [user.id]
    );
    const campaignId = cRows[0].id;

    // Reserve 1 email from wallet
    const res = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'failing_persist_k',
          recipient: 'failing_msg@test.vn',
        }),
        requestPayload: { failTest: true },
      },
      { modeOverride: 'test_enforce' }
    );
    expect(res.wallet_quantity).toBe(1);

    await markSendQuotaSending({ reservationId: res.id }, { modeOverride: 'test_enforce' });

    // Execute consumeSendQuota with persistSource that inserts a message row then throws
    await expect(
      consumeSendQuota(
        {
          reservationId: res.id,
          persistSource: async (txClient) => {
            await txClient.query(
              `INSERT INTO email_messages (id_campaign, recipient_email, status, quota_reservation_id)
               VALUES ($1, 'failing_msg@test.vn', 'sent', $2)`,
              [campaignId, res.id]
            );
            throw new Error('Simulated network timeout during post-send provider confirmation');
          },
        },
        { modeOverride: 'test_enforce' }
      )
    ).rejects.toMatchObject({
      status: 503,
      code: 'SEND_QUOTA_UNAVAILABLE',
    });

    // 1. Message insertion was rolled back
    const { rows: msgRows } = await db.query(
      'SELECT * FROM email_messages WHERE id_campaign = $1',
      [campaignId]
    );
    expect(msgRows).toHaveLength(0);

    // 2. Topup debit was rolled back
    const { rows: debitRows } = await db.query(
      'SELECT * FROM topup_debits WHERE user_id = $1',
      [user.id]
    );
    expect(debitRows).toHaveLength(0);

    // 3. Reservation status remains sending (ready for retry/uncertain marking)
    const { rows: resRows } = await db.query(
      'SELECT status FROM send_quota_reservations WHERE id = $1',
      [res.id]
    );
    expect(resRows[0].status).toBe('sending');
  });

  it('13. Direct simultaneous contention with barrier between consumeSendQuota and reserveSendQuota on same wallet', async () => {
    const plan = await createTestPlan({ monthlyEmail: 1 });
    const user = await createUser({ username: `user_wallet_sim_${Date.now()}` });
    await assignPlanToUser(user.id, plan.id);

    // Consume plan monthly limit
    const preRes = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'pre_sim_wallet',
          recipient: 'pre_sim@test.vn',
        }),
        requestPayload: { pre: 1 },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: preRes.id }, { modeOverride: 'test_enforce' });
    await consumeSendQuota({ reservationId: preRes.id }, { modeOverride: 'test_enforce' });

    // Grant 1 wallet unit
    const orderCode = Date.now() + Math.floor(Math.random() * 1000000);
    const { rows: ordRows } = await db.query(
      `INSERT INTO orders (user_id, order_code, status, amount)
       VALUES ($1, $2, 'success', 50000)
       RETURNING id`,
      [user.id, orderCode]
    );
    await db.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, 'emails', 1, $2, NULL)`,
      [user.id, ordRows[0].id]
    );

    // Create reservation 1 holding the single wallet unit
    const resA = await reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'res_a_wallet_slot',
          recipient: 'resa@test.vn',
        }),
        requestPayload: { a: 1 },
      },
      { modeOverride: 'test_enforce' }
    );
    await markSendQuotaSending({ reservationId: resA.id }, { modeOverride: 'test_enforce' });

    // Set up barrier to guarantee true in-flight overlap
    let releaseBarrier;
    const barrierReached = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    let resumePersist;
    const pausePersist = new Promise((resolve) => {
      resumePersist = resolve;
    });

    // Worker 1 starts consumeSendQuota with persistSource holding locks
    const consumePromise = consumeSendQuota(
      {
        reservationId: resA.id,
        persistSource: async () => {
          releaseBarrier(); // signal Worker 2 that locks and wallet debit are in progress
          await pausePersist; // wait until Worker 2 has launched reserve attempt
        },
      },
      { modeOverride: 'test_enforce' }
    );

    await barrierReached;

    // Worker 2 launches reserveSendQuota while Worker 1 is in-flight inside transaction
    const reservePromise = reserveSendQuota(
      {
        userId: user.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: 'res_b_competing_wallet',
          recipient: 'resb@test.vn',
        }),
        requestPayload: { b: 1 },
      },
      { modeOverride: 'test_enforce' }
    );

    // Give Worker 2 time to block on the advisory lock, then let Worker 1 proceed
    await new Promise((r) => setTimeout(r, 50));
    resumePersist();

    const [consumeResult, reserveResult] = await Promise.allSettled([consumePromise, reservePromise]);

    expect(consumeResult.status).toBe('fulfilled');
    expect(consumeResult.value.status).toBe('consumed');

    expect(reserveResult.status).toBe('rejected');
    expect(reserveResult.reason.status).toBe(403);
    expect(reserveResult.reason.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(reserveResult.reason.limitType).toBe('monthly');

    // Final balance is exactly 0 available, exactly 1 debited
    const finalWallet = await getWalletAvailableBalance(db, user.id, 'emails');
    expect(finalWallet.available).toBe(0);
    expect(finalWallet.debited).toBe(1);
  });

  it('14. 20-round full lifecycle concurrency loop: 5 workers simultaneously racing full pipeline per round', async () => {
    for (let round = 0; round < 20; round++) {
      const plan = await createTestPlan({ dailyEmail: 1 });
      const user = await createUser({ username: `full_pipeline_u_${round}_${Date.now()}` });
      await assignPlanToUser(user.id, plan.id);

      const workerPipeline = async (workerIdx) => {
        const recipient = `fl_${round}_${workerIdx}@test.vn`;
        const key = buildDirectReservationKey({
          channel: 'email',
          billingUserId: user.id,
          clientKey: `fl_${round}_${workerIdx}`,
          recipient,
        });

        // 1. Reserve
        const reserved = await reserveSendQuota(
          {
            userId: user.id,
            channel: 'email',
            quantity: 1,
            reservationKey: key,
            requestPayload: { round, workerIdx },
          },
          { modeOverride: 'test_enforce' }
        );

        // 2. Mark sending
        await markSendQuotaSending({ reservationId: reserved.id }, { modeOverride: 'test_enforce' });

        // 3. Consume
        const consumed = await consumeSendQuota({ reservationId: reserved.id }, { modeOverride: 'test_enforce' });
        return consumed;
      };

      const promises = [0, 1, 2, 3, 4].map((workerIdx) => workerPipeline(workerIdx));
      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0].value.status).toBe('consumed');

      expect(rejected).toHaveLength(4);
      for (const r of rejected) {
        expect(r.reason.status).toBe(403);
        expect(r.reason.limitType).toBe('daily');
      }
    }
  });

  it('15. Automatic billing context resolution for employee when ownerContextId is omitted', async () => {
    const plan = await createTestPlan({ dailyEmail: 5 });
    const owner = await createUser({ username: `owner_auto_${Date.now()}` });
    await assignPlanToUser(owner.id, plan.id);

    const employee = await createUser({ username: `emp_auto_${Date.now()}`, withPlan: false });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, daily_email_limit)
       VALUES ($1, $2, 'active', 5)`,
      [owner.id, employee.id]
    );

    // Call reserveSendQuota as employee WITHOUT ownerContextId
    const res = await reserveSendQuota(
      {
        userId: employee.id,
        channel: 'email',
        quantity: 1,
        reservationKey: buildDirectReservationKey({
          channel: 'email',
          billingUserId: owner.id,
          clientKey: 'emp_no_ctx_key',
          recipient: 'emp_no_ctx@test.vn',
        }),
        requestPayload: { test: 'no_ctx' },
      },
      { modeOverride: 'test_enforce' }
    );

    expect(res.allowed).toBe(true);
    expect(res.billing_user_id).toBe(owner.id);
  });
});
