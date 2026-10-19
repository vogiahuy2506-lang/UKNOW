/**
 * PLAN_SAN_SANG_BAT_ENFORCE_HAN_MUC_2026-10-19 PR-E1 — bộ dọn đặt chỗ hạn mức (sendQuotaReservationSweeper).
 *
 * Postgres thật. Dựng tình huống bằng cách đặt chỗ thật rồi lùi `expires_at` / `sending_at` về quá khứ (khuôn repro
 * sweeperGapRepro). Ngữ nghĩa đã chốt (docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md §5.1/§5.3):
 *   reserved hết lease → released; sending quá ngưỡng → uncertain (KHÔNG BAO GIỜ released); uncertain/consumed không xoá;
 *   chỉ released quá 30 ngày được dọn.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
} from '../../src/services/quota/sendQuotaReservation.service.js';
import { buildDirectReservationKey } from '../../src/services/quota/sendQuotaKey.service.js';
import {
  getWalletAvailableBalance,
  lockReservationIfExpired,
  lockReservationIfStaleSending,
} from '../../src/repositories/sendQuota.repository.js';
import { sweepReservations } from '../../src/services/quota/sendQuotaReservationSweeper.service.js';
import { cleanupReleasedSendQuotaReservations } from '../../src/services/admin/dataRetentionCleanup.service.js';
import { recordRun } from '../../src/repositories/admin/cronJobRun.repository.js';

const ENFORCE = { modeOverride: 'enforce' };
let seq = 0;

async function setup(limits) {
  seq += 1;
  const plan = await createPlan({ ...limits });
  const user = await createUser({ username: `sweeper_${Date.now()}_${seq}`, withPlan: false });
  await db.query(
    `UPDATE users SET active_plan_id = $1, plan_activated_at = NOW() - interval '10 days',
            subscription_expires_at = NOW() + interval '30 days' WHERE id = $2`,
    [plan.id, user.id]
  );
  return user;
}

const params = (user, tag) => ({
  userId: user.id,
  channel: 'email',
  quantity: 1,
  sourceType: 'direct_email',
  reservationKey: buildDirectReservationKey({ channel: 'email', billingUserId: user.id, clientKey: tag, recipient: 'a@b.com' }),
  requestPayload: { channel: 'email', recipient: 'a@b.com', tag },
});

async function expireLease(id) {
  await db.query("UPDATE send_quota_reservations SET expires_at = NOW() - interval '2 hours' WHERE id = $1", [id]);
}

async function backdateSending(id, seconds) {
  await db.query(
    `UPDATE send_quota_reservations SET sending_at = NOW() - make_interval(secs => $2) WHERE id = $1`,
    [id, seconds]
  );
}

async function getRow(id) {
  const { rows } = await db.query('SELECT * FROM send_quota_reservations WHERE id = $1', [id]);
  return rows[0];
}

/** Người dùng đã có 1 email gửi trong chu kỳ + hạn mức tháng 1 → đặt chỗ kế tiếp dùng ví (wallet_quantity = 1). */
async function setupWalletUser() {
  const user = await setup({ dailyEmailLimit: null, monthlyEmailLimit: 1 });
  await db.query(
    `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
     VALUES ($1,'x@e.com','s@e.com','S','sent',false,LOCALTIMESTAMP)`,
    [user.id]
  );
  const { rows } = await db.query(
    "INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 1) RETURNING id",
    [user.id, 9100000000 + seq]
  );
  await db.query(
    "INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1,'emails',1,$2,NULL)",
    [user.id, rows[0].id]
  );
  return user;
}

describe('PR-E1: bộ dọn đặt chỗ hạn mức (sendQuotaReservationSweeper)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('reserved hết lease → released', () => {
    it('hạn mức ngày 1: sweep trả chỗ, failure_code=lease_expired, reserve mới được phép', async () => {
      const user = await setup({ dailyEmailLimit: 1 });
      const r = await reserveSendQuota(params(user, 'crash1'), ENFORCE);
      await expireLease(r.id);

      const result = await sweepReservations();

      expect(result).toMatchObject({ released: 1, markedUncertain: 0, skipped: 0, status: 'success' });
      const row = await getRow(r.id);
      expect(row.status).toBe('released');
      expect(row.failure_code).toBe('lease_expired');
      expect(row.released_at).not.toBeNull();
      await expect(reserveSendQuota(params(user, 'next1'), ENFORCE)).resolves.toMatchObject({ allowed: true });
    });

    it('trước khi sweep, reserve mới BỊ chặn (chứng minh sweep là thứ mở chỗ)', async () => {
      const user = await setup({ dailyEmailLimit: 1 });
      const r = await reserveSendQuota(params(user, 'crash1b'), ENFORCE);
      await expireLease(r.id);
      await expect(reserveSendQuota(params(user, 'blocked'), ENFORCE)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    });

    it('ví: đặt chỗ dùng ví, hết lease, sweep → ví available về 1', async () => {
      const user = await setupWalletUser();
      const r = await reserveSendQuota(params(user, 'wallet1'), ENFORCE);
      expect(r.wallet_quantity).toBe(1);
      await expireLease(r.id);
      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(0);

      await sweepReservations();

      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(1);
    });

    it('retry cùng reservationKey sau sweep: không còn 409, re-reserve qua released → reserved', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'retry1'), ENFORCE);
      await expireLease(r.id);
      await sweepReservations();

      const again = await reserveSendQuota(params(user, 'retry1'), ENFORCE);

      expect(again.retriedFromReleased).toBe(true);
      expect(again.id).toBe(r.id);
      expect((await getRow(r.id)).status).toBe('reserved');
    });
  });

  describe('sending quá ngưỡng → uncertain (KHÔNG BAO GIỜ released)', () => {
    it('sending_at cũ hơn ngưỡng → uncertain, failure_code=sending_stale, VẪN chặn reserve vượt hạn mức', async () => {
      const user = await setup({ dailyEmailLimit: 1 });
      const r = await reserveSendQuota(params(user, 'stale1'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 3 * 3600);

      const result = await sweepReservations();

      expect(result).toMatchObject({ released: 0, markedUncertain: 1, status: 'success' });
      const row = await getRow(r.id);
      expect(row.status).toBe('uncertain');
      expect(row.failure_code).toBe('sending_stale');
      expect(row.uncertain_at).not.toBeNull();
      expect(row.released_at).toBeNull();
      await expect(reserveSendQuota(params(user, 'after-uncertain'), ENFORCE)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    });

    it('ví vẫn giữ sau khi đánh uncertain', async () => {
      const user = await setupWalletUser();
      const r = await reserveSendQuota(params(user, 'stale-wallet'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 3 * 3600);

      await sweepReservations();

      expect((await getRow(r.id)).status).toBe('uncertain');
      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(0);
    });

    it('retry cùng khoá khi dòng uncertain → 409 RESERVATION_UNCERTAIN (chặn gửi trùng)', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'stale-retry'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 3 * 3600);
      await sweepReservations();

      await expect(reserveSendQuota(params(user, 'stale-retry'), ENFORCE)).rejects.toMatchObject({ code: 'RESERVATION_UNCERTAIN' });
    });

    it('ngưỡng mặc định 1800s: sending 10 phút tuổi giữ nguyên; truyền staleSendingSeconds=60 thì → uncertain', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'threshold'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 600);

      expect(await sweepReservations()).toMatchObject({ released: 0, markedUncertain: 0, status: 'noop' });
      expect((await getRow(r.id)).status).toBe('sending');

      expect(await sweepReservations({ staleSendingSeconds: 60 })).toMatchObject({ markedUncertain: 1 });
      expect((await getRow(r.id)).status).toBe('uncertain');
    });
  });

  describe('không đụng tới dòng không đủ điều kiện', () => {
    it('reserved còn lease / sending trong ngưỡng / consumed / uncertain / released: không đổi, status noop', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const leased = await reserveSendQuota(params(user, 'keep-leased'), ENFORCE);

      const sending = await reserveSendQuota(params(user, 'keep-sending'), ENFORCE);
      await markSendQuotaSending({ reservationId: sending.id }, ENFORCE);

      const consumed = await reserveSendQuota(params(user, 'keep-consumed'), ENFORCE);
      await markSendQuotaSending({ reservationId: consumed.id }, ENFORCE);
      await consumeSendQuota({ reservationId: consumed.id }, ENFORCE);
      await backdateSending(consumed.id, 99 * 86400);

      const uncertain = await reserveSendQuota(params(user, 'keep-uncertain'), ENFORCE);
      await markSendQuotaSending({ reservationId: uncertain.id }, ENFORCE);
      await db.query("UPDATE send_quota_reservations SET status = 'uncertain', uncertain_at = NOW() - interval '400 days' WHERE id = $1", [uncertain.id]);

      const released = await reserveSendQuota(params(user, 'keep-released'), ENFORCE);
      await releaseSendQuota({ reservationId: released.id, failureCode: 'x' }, ENFORCE);
      await expireLease(released.id);

      const before = await db.query('SELECT id, status, failure_code FROM send_quota_reservations ORDER BY id');
      const result = await sweepReservations();
      const after = await db.query('SELECT id, status, failure_code FROM send_quota_reservations ORDER BY id');

      expect(result).toMatchObject({ released: 0, markedUncertain: 0, skipped: 0, status: 'noop' });
      expect(after.rows).toEqual(before.rows);
      expect((await getRow(leased.id)).status).toBe('reserved');
    });

    it('bảng rỗng (shadow/off không có dòng nào) → noop, không lỗi', async () => {
      expect(await sweepReservations()).toEqual({ released: 0, markedUncertain: 0, skipped: 0, status: 'noop' });
    });

    it('khoá có kiểm lại điều kiện: dòng không còn hết lease / không còn treo thì lockReservationIfExpired / IfStaleSending trả null', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const fresh = await reserveSendQuota(params(user, 'lock-fresh'), ENFORCE);
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        expect(await lockReservationIfExpired(client, fresh.id)).toBeNull(); // còn lease
        expect(await lockReservationIfStaleSending(client, fresh.id, 60)).toBeNull(); // chưa sending
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      await expireLease(fresh.id);
      const client2 = await db.getClient();
      try {
        await client2.query('BEGIN');
        expect((await lockReservationIfExpired(client2, fresh.id))?.id).toBe(fresh.id);
        await client2.query('ROLLBACK');
      } finally {
        client2.release();
      }
    });

    it('đua với luồng gửi: dòng vừa được chuyển sang sending (chưa commit) khi bộ dọn tới → KHÔNG bị released', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'race1'), ENFORCE);
      await expireLease(r.id);

      const sender = await db.getClient();
      try {
        await sender.query('BEGIN');
        // Luồng gửi giữ khoá dòng và chuyển sang sending nhưng CHƯA commit.
        await sender.query("UPDATE send_quota_reservations SET status = 'sending', sending_at = NOW() WHERE id = $1", [r.id]);
        const sweeping = sweepReservations();
        await new Promise((resolve) => setTimeout(resolve, 400));
        await sender.query('COMMIT');
        const result = await sweeping;

        expect(result.released).toBe(0);
        expect(result.markedUncertain).toBe(0);
        expect((await getRow(r.id)).status).toBe('sending');
      } finally {
        sender.release();
      }
    });
  });

  describe('luồng gửi còn sống chốt dòng đã bị đánh uncertain', () => {
    it('consume một dòng uncertain → consumed; ví bị trừ đúng 1 lần; persistSource gắn quota_reservation_id vào bản ghi tin', async () => {
      const user = await setupWalletUser();
      const r = await reserveSendQuota(params(user, 'late-consume'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 3 * 3600);
      await sweepReservations();
      expect((await getRow(r.id)).status).toBe('uncertain');

      const { rows: msg } = await db.query(
        `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
         VALUES ($1,'late@e.com','s@e.com','S','queued',false,LOCALTIMESTAMP) RETURNING id`,
        [user.id]
      );
      const persistSource = async (client) => {
        await client.query(
          "UPDATE email_messages SET quota_reservation_id = $1, status = 'sent' WHERE id = $2",
          [r.id, msg[0].id]
        );
      };

      const consumed = await consumeSendQuota({ reservationId: r.id, persistSource }, ENFORCE);
      expect(consumed.status).toBe('consumed');
      expect((await getRow(r.id)).status).toBe('consumed');

      const debits = await db.query("SELECT COUNT(*)::int AS n, COALESCE(SUM(qty),0)::int AS q FROM topup_debits WHERE source_key = $1", [`quota_reservation:${r.id}`]);
      expect(debits.rows[0]).toEqual({ n: 1, q: 1 });
      const linked = await db.query('SELECT quota_reservation_id, status FROM email_messages WHERE id = $1', [msg[0].id]);
      expect(Number(linked.rows[0].quota_reservation_id)).toBe(Number(r.id));
      expect(linked.rows[0].status).toBe('sent');

      // Idempotent: gọi lại không trừ ví lần hai.
      await consumeSendQuota({ reservationId: r.id, persistSource }, ENFORCE);
      const again = await db.query("SELECT COUNT(*)::int AS n FROM topup_debits WHERE source_key = $1", [`quota_reservation:${r.id}`]);
      expect(again.rows[0].n).toBe(1);
    });

    it('consume dòng đã released vẫn BỊ TỪ CHỐI (409 INVALID_RESERVATION_TRANSITION)', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'consume-released'), ENFORCE);
      await expireLease(r.id);
      await sweepReservations();
      expect((await getRow(r.id)).status).toBe('released');

      await expect(consumeSendQuota({ reservationId: r.id }, ENFORCE)).rejects.toMatchObject({
        code: 'INVALID_RESERVATION_TRANSITION',
      });
    });

    it('release dòng uncertain vẫn hợp lệ (đối soát: chưa gửi)', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'release-uncertain'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      await backdateSending(r.id, 3 * 3600);
      await sweepReservations();

      await releaseSendQuota({ reservationId: r.id, failureCode: 'reconciled_not_sent' }, ENFORCE);
      expect((await getRow(r.id)).status).toBe('released');
    });
  });

  describe('đồng thời và theo lô', () => {
    it('hai lượt sweeper song song: mỗi dòng chuyển đúng 1 lần, không lỗi', async () => {
      const user = await setup({ dailyEmailLimit: 1000 });
      const ids = [];
      for (let i = 0; i < 6; i += 1) {
        const r = await reserveSendQuota(params(user, `par-${i}`), ENFORCE);
        ids.push(r.id);
      }
      for (const id of ids) await expireLease(id);
      const s = await reserveSendQuota(params(user, 'par-sending'), ENFORCE);
      await markSendQuotaSending({ reservationId: s.id }, ENFORCE);
      await backdateSending(s.id, 3 * 3600);

      const [a, b] = await Promise.all([
        sweepReservations({ batchSize: 2 }),
        sweepReservations({ batchSize: 2 }),
      ]);

      expect(a.released + b.released).toBe(6);
      expect(a.markedUncertain + b.markedUncertain).toBe(1);
      const { rows } = await db.query('SELECT status, COUNT(*)::int AS n FROM send_quota_reservations GROUP BY status ORDER BY status');
      expect(rows).toEqual([{ status: 'released', n: 6 }, { status: 'uncertain', n: 1 }]);
    });

    it('trần số lô: maxBatches=1, batchSize=2 chỉ xử lý 2 dòng mỗi lượt; lượt sau làm tiếp', async () => {
      const user = await setup({ dailyEmailLimit: 1000 });
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await reserveSendQuota(params(user, `cap-${i}`), ENFORCE);
        ids.push(r.id);
      }
      for (const id of ids) await expireLease(id);

      expect((await sweepReservations({ batchSize: 2, maxBatches: 1 })).released).toBe(2);
      expect((await sweepReservations({ batchSize: 2, maxBatches: 1 })).released).toBe(2);
      expect((await sweepReservations({ batchSize: 2, maxBatches: 1 })).released).toBe(1);
    });
  });

  describe('dọn released quá 30 ngày (data_retention_cleanup)', () => {
    it('released 31 ngày bị xoá; released 29 ngày, uncertain 400 ngày, consumed 400 ngày được giữ', async () => {
      const user = await setup({ dailyEmailLimit: 1000 });
      const mk = async (tag) => (await reserveSendQuota(params(user, tag), ENFORCE)).id;
      const released31 = await mk('ret-r31');
      const released29 = await mk('ret-r29');
      const uncertain400 = await mk('ret-u400');
      const consumed400 = await mk('ret-c400');
      await db.query("UPDATE send_quota_reservations SET status='released', released_at = NOW() - interval '31 days' WHERE id = $1", [released31]);
      await db.query("UPDATE send_quota_reservations SET status='released', released_at = NOW() - interval '29 days' WHERE id = $1", [released29]);
      await db.query("UPDATE send_quota_reservations SET status='uncertain', uncertain_at = NOW() - interval '400 days', created_at = NOW() - interval '400 days' WHERE id = $1", [uncertain400]);
      await db.query("UPDATE send_quota_reservations SET status='consumed', consumed_at = NOW() - interval '400 days', created_at = NOW() - interval '400 days' WHERE id = $1", [consumed400]);

      const deleted = await cleanupReleasedSendQuotaReservations();

      expect(deleted).toBe(1);
      const { rows } = await db.query('SELECT id FROM send_quota_reservations ORDER BY id');
      expect(rows.map((x) => String(x.id)).sort()).toEqual([released29, uncertain400, consumed400].map(String).sort());
    });

    it('xoá theo lô: batchSize nhỏ vẫn dọn hết released cũ', async () => {
      const user = await setup({ dailyEmailLimit: 1000 });
      for (let i = 0; i < 5; i += 1) {
        const r = await reserveSendQuota(params(user, `ret-batch-${i}`), ENFORCE);
        await db.query("UPDATE send_quota_reservations SET status='released', released_at = NOW() - interval '40 days' WHERE id = $1", [r.id]);
      }
      expect(await cleanupReleasedSendQuotaReservations({ batchSize: 2 })).toBe(5);
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM send_quota_reservations');
      expect(rows[0].n).toBe(0);
    });
  });

  describe('ghi nhận trong cron_job_runs', () => {
    it('lượt không có gì → noop; lượt có việc → success', async () => {
      await recordRun('send_quota_reservation_sweep', () => sweepReservations());
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await reserveSendQuota(params(user, 'cron1'), ENFORCE);
      await expireLease(r.id);
      await recordRun('send_quota_reservation_sweep', () => sweepReservations());

      const { rows } = await db.query(
        "SELECT status, result FROM cron_job_runs WHERE job_code = 'send_quota_reservation_sweep' ORDER BY id"
      );
      expect(rows.map((x) => x.status)).toEqual(['noop', 'success']);
      expect(rows[1].result).toMatchObject({ released: 1, markedUncertain: 0 });
    });
  });
});
