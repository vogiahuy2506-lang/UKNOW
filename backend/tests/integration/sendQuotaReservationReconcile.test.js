/**
 * R2 (PLAN_SUA_NOT_GIO_GUI_TIEP_VA_DOI_SOAT_UNCERTAIN_2026-10-20) — công cụ ADMIN đối soát đặt chỗ hạn mức `uncertain`.
 *
 * Postgres thật. Dựng dòng `uncertain` đúng đường production: đặt chỗ thật → sending → lùi `sending_at` → bộ dọn
 * (sendQuotaReservationSweeper). Ngữ nghĩa (docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md §5.3):
 *   uncertain → consumed khi chứng minh đã gửi (trừ ví đúng một lần, CÙNG sourceKey với đường consume);
 *   uncertain → released khi chứng minh chưa gửi (hạn mức + ví về).
 * Không có cron: chỉ người gọi API quản trị mới đối soát.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import db from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
} from '../../src/services/quota/sendQuotaReservation.service.js';
import { buildDirectReservationKey } from '../../src/services/quota/sendQuotaKey.service.js';
import { getWalletAvailableBalance } from '../../src/repositories/sendQuota.repository.js';
import { sweepReservations } from '../../src/services/quota/sendQuotaReservationSweeper.service.js';
import {
  reconcileUncertainReservation,
  listUncertainReservations,
} from '../../src/services/quota/sendQuotaReservationReconcile.service.js';

const ENFORCE = { modeOverride: 'enforce' };
let seq = 0;
let app;

beforeAll(() => {
  app = createApp();
});

async function setup(limits) {
  seq += 1;
  const plan = await createPlan({ ...limits });
  const user = await createUser({ username: `reconcile_${Date.now()}_${seq}`, withPlan: false });
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

async function getRow(id) {
  const { rows } = await db.query('SELECT * FROM send_quota_reservations WHERE id = $1', [id]);
  return rows[0];
}

/** Người dùng đã có 1 email trong chu kỳ + hạn mức tháng 1 + 1 lượt ví → đặt chỗ kế tiếp giữ ví (wallet_quantity = 1). */
async function setupWalletUser() {
  const user = await setup({ dailyEmailLimit: null, monthlyEmailLimit: 1 });
  await db.query(
    `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
     VALUES ($1,'x@e.com','s@e.com','S','sent',false,LOCALTIMESTAMP)`,
    [user.id]
  );
  const { rows } = await db.query(
    "INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 1) RETURNING id",
    [user.id, 9200000000 + seq]
  );
  await db.query(
    "INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end) VALUES ($1,'emails',1,$2,NULL)",
    [user.id, rows[0].id]
  );
  return user;
}

/** Đặt chỗ → sending → treo quá ngưỡng → bộ dọn đánh `uncertain`. */
async function makeUncertain(user, tag) {
  const r = await reserveSendQuota(params(user, tag), ENFORCE);
  await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
  await db.query("UPDATE send_quota_reservations SET sending_at = NOW() - interval '3 hours' WHERE id = $1", [r.id]);
  await sweepReservations();
  expect((await getRow(r.id)).status).toBe('uncertain');
  return r;
}

async function debitCount(id) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n, COALESCE(SUM(qty),0)::int AS q FROM topup_debits WHERE source_key = $1',
    [`quota_reservation:${id}`]
  );
  return rows[0];
}

describe('R2: reconcileUncertainReservation (service)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('sent — chứng minh đã gửi', () => {
    it('uncertain giữ ví 1 → consumed, ví trừ đúng 1 lần (debit quota_reservation:<id>), vẫn tính hạn mức', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'sent-wallet');
      expect(r.wallet_quantity).toBe(1);
      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(0);

      const result = await reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1, note: ' đã thấy trong hộp thư ' });

      expect(result).toMatchObject({ outcome: 'sent', walletDebited: true, walletQuantity: 1, quantity: 1, note: 'đã thấy trong hộp thư' });
      const row = await getRow(r.id);
      expect(row.status).toBe('consumed');
      expect(row.consumed_at).not.toBeNull();
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });
      // Ví đã dùng thật: không còn gì khả dụng, và cũng không giữ chỗ nào nữa.
      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(0);
    });

    it('uncertain KHÔNG giữ ví → consumed, không có debit nào, hạn mức vẫn bị tính', async () => {
      const user = await setup({ dailyEmailLimit: 1 });
      const r = await makeUncertain(user, 'sent-nowallet');

      const result = await reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 });

      expect(result.walletDebited).toBe(false);
      expect((await getRow(r.id)).status).toBe('consumed');
      expect(await debitCount(r.id)).toEqual({ n: 0, q: 0 });
      await expect(reserveSendQuota(params(user, 'after-sent'), ENFORCE)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    });

    it('gọi sent lần hai → 409 RESERVATION_NOT_UNCERTAIN, ví KHÔNG bị trừ thêm', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'sent-twice');
      await reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 });

      await expect(reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 })).rejects.toMatchObject({
        status: 409,
        code: 'RESERVATION_NOT_UNCERTAIN',
        currentStatus: 'consumed',
      });
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });
    });

    it('luồng gửi còn sống đã consume dòng uncertain trước → đối soát sent bị 409, ví chỉ trừ 1 lần (của đường consume)', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'sent-after-consume');
      await consumeSendQuota({ reservationId: r.id }, ENFORCE);
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });

      await expect(reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 })).rejects.toMatchObject({
        status: 409,
        code: 'RESERVATION_NOT_UNCERTAIN',
      });
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });
    });

    it('đua: đối soát sent song song với consumeSendQuota → đúng 1 debit, dòng consumed', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'sent-race-consume');

      const settled = await Promise.allSettled([
        reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 }),
        consumeSendQuota({ reservationId: r.id }, ENFORCE),
      ]);

      expect(settled.some((s) => s.status === 'fulfilled')).toBe(true);
      expect((await getRow(r.id)).status).toBe('consumed');
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });
    });

    it('đua: hai quản trị viên cùng bấm sent → đúng một bên thành công, 1 debit', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'sent-race-admin');

      const settled = await Promise.allSettled([
        reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 }),
        reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 2 }),
      ]);

      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
      const rejected = settled.find((s) => s.status === 'rejected');
      expect(rejected.reason).toMatchObject({ status: 409, code: 'RESERVATION_NOT_UNCERTAIN' });
      expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });
    });
  });

  describe('not_sent — chứng minh chưa gửi', () => {
    it('uncertain → released, failure_code admin_reconciled_not_sent, hạn mức về (reserve mới được phép)', async () => {
      const user = await setup({ dailyEmailLimit: 1 });
      const r = await makeUncertain(user, 'notsent-quota');
      await expect(reserveSendQuota(params(user, 'blocked'), ENFORCE)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });

      const result = await reconcileUncertainReservation({ reservationId: r.id, outcome: 'not_sent', adminUserId: 1 });

      expect(result).toMatchObject({ outcome: 'not_sent', walletDebited: false });
      const row = await getRow(r.id);
      expect(row.status).toBe('released');
      expect(row.failure_code).toBe('admin_reconciled_not_sent');
      expect(row.released_at).not.toBeNull();
      await expect(reserveSendQuota(params(user, 'next'), ENFORCE)).resolves.toMatchObject({ allowed: true });
    });

    it('uncertain giữ ví → released: ví available tăng lại 1, KHÔNG có debit', async () => {
      const user = await setupWalletUser();
      const r = await makeUncertain(user, 'notsent-wallet');
      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(0);

      await reconcileUncertainReservation({ reservationId: r.id, outcome: 'not_sent', adminUserId: 1 });

      expect((await getWalletAvailableBalance(db, user.id, 'emails')).available).toBe(1);
      expect(await debitCount(r.id)).toEqual({ n: 0, q: 0 });
    });
  });

  describe('chỉ dòng uncertain mới đối soát được', () => {
    it.each([
      ['reserved', async (user) => reserveSendQuota(params(user, 'st-reserved'), ENFORCE)],
      ['sending', async (user) => {
        const r = await reserveSendQuota(params(user, 'st-sending'), ENFORCE);
        await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
        return r;
      }],
      ['consumed', async (user) => {
        const r = await reserveSendQuota(params(user, 'st-consumed'), ENFORCE);
        await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
        await consumeSendQuota({ reservationId: r.id }, ENFORCE);
        return r;
      }],
      ['released', async (user) => {
        const r = await reserveSendQuota(params(user, 'st-released'), ENFORCE);
        await db.query("UPDATE send_quota_reservations SET status='released', released_at = NOW() WHERE id = $1", [r.id]);
        return r;
      }],
    ])('dòng %s → 409 RESERVATION_NOT_UNCERTAIN, không đổi gì (cả sent lẫn not_sent)', async (status, make) => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await make(user);
      const before = await getRow(r.id);

      for (const outcome of ['sent', 'not_sent']) {
        await expect(reconcileUncertainReservation({ reservationId: r.id, outcome, adminUserId: 1 })).rejects.toMatchObject({
          status: 409,
          code: 'RESERVATION_NOT_UNCERTAIN',
          currentStatus: status,
        });
      }

      const after = await getRow(r.id);
      expect(after.status).toBe(status);
      expect(after.updated_at).toEqual(before.updated_at);
      expect(await debitCount(r.id)).toEqual({ n: 0, q: 0 });
    });

    it('dòng sending giữ ví: đối soát sent KHÔNG được trừ ví (chặn đúng ở kiểm trạng thái)', async () => {
      const user = await setupWalletUser();
      const r = await reserveSendQuota(params(user, 'st-sending-wallet'), ENFORCE);
      await markSendQuotaSending({ reservationId: r.id }, ENFORCE);
      expect(r.wallet_quantity).toBe(1);

      await expect(reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', adminUserId: 1 })).rejects.toMatchObject({
        code: 'RESERVATION_NOT_UNCERTAIN',
      });
      expect(await debitCount(r.id)).toEqual({ n: 0, q: 0 });
      expect((await getRow(r.id)).status).toBe('sending');
    });
  });

  describe('đầu vào sai', () => {
    it('không tồn tại → 404; outcome lạ → 400; id rác → 400; ghi chú quá dài → 400', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await makeUncertain(user, 'bad-input');

      await expect(reconcileUncertainReservation({ reservationId: 99999999, outcome: 'sent' })).rejects.toMatchObject({ status: 404, code: 'RESERVATION_NOT_FOUND' });
      await expect(reconcileUncertainReservation({ reservationId: r.id, outcome: 'released' })).rejects.toMatchObject({ status: 400, code: 'INVALID_OUTCOME' });
      await expect(reconcileUncertainReservation({ reservationId: r.id })).rejects.toMatchObject({ status: 400, code: 'INVALID_OUTCOME' });
      await expect(reconcileUncertainReservation({ reservationId: 'abc', outcome: 'sent' })).rejects.toMatchObject({ status: 400, code: 'INVALID_RESERVATION_ID' });
      await expect(reconcileUncertainReservation({ reservationId: r.id, outcome: 'sent', note: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400, code: 'INVALID_NOTE' });
      expect((await getRow(r.id)).status).toBe('uncertain');
    });
  });

  describe('listUncertainReservations', () => {
    it('chỉ trả dòng uncertain, hasMessageEvidence đúng theo dòng tin gắn quota_reservation_id, có phân trang', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const withEvidence = await makeUncertain(user, 'list-evidence');
      const withoutEvidence = await makeUncertain(user, 'list-plain');
      // Các trạng thái khác KHÔNG được xuất hiện.
      const sending = await reserveSendQuota(params(user, 'list-sending'), ENFORCE);
      await markSendQuotaSending({ reservationId: sending.id }, ENFORCE);
      await reserveSendQuota(params(user, 'list-reserved'), ENFORCE);
      const consumed = await reserveSendQuota(params(user, 'list-consumed'), ENFORCE);
      await markSendQuotaSending({ reservationId: consumed.id }, ENFORCE);
      await consumeSendQuota({ reservationId: consumed.id }, ENFORCE);

      await db.query(
        `INSERT INTO email_messages (workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at, quota_reservation_id)
         VALUES ($1,'e@e.com','s@e.com','S','sent',false,LOCALTIMESTAMP,$2)`,
        [user.id, withEvidence.id]
      );

      const page = await listUncertainReservations();

      expect(page.total).toBe(2);
      expect(page.items.map((i) => i.id).sort()).toEqual([String(withEvidence.id), String(withoutEvidence.id)].sort());
      const byId = Object.fromEntries(page.items.map((i) => [i.id, i]));
      expect(byId[String(withEvidence.id)]).toMatchObject({
        hasMessageEvidence: true,
        evidenceTables: ['email_messages'],
        billingUserId: Number(user.id),
        billingEmail: user.email,
        channel: 'email',
        quantity: 1,
        walletQuantity: 0,
        failureCode: 'sending_stale',
      });
      expect(byId[String(withEvidence.id)].uncertainAt).not.toBeNull();
      expect(byId[String(withoutEvidence.id)]).toMatchObject({ hasMessageEvidence: false, evidenceTables: [] });

      const first = await listUncertainReservations({ limit: 1, offset: 0 });
      const second = await listUncertainReservations({ limit: 1, offset: 1 });
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(first.items[0].id).not.toBe(second.items[0].id);
      expect(first.total).toBe(2);
    });

    it('bằng chứng nhận ra thêm usage_logs và campaign_channel_messages (không chỉ email_messages)', async () => {
      const user = await setup({ dailyEmailLimit: 100 });
      const r = await makeUncertain(user, 'list-tables');
      await db.query(
        `INSERT INTO usage_logs (id_user, resource_type, period_start, period_end, quota_reservation_id)
         VALUES ($1, 'email_sent', NOW(), NOW(), $2)`,
        [user.id, r.id]
      );
      await db.query(
        `INSERT INTO campaign_channel_messages (channel, recipient_key, status, quota_reservation_id, workspace_owner_id)
         VALUES ('telegram', 'tg:1', 'sent', $1, $2)`,
        [r.id, user.id]
      );

      const page = await listUncertainReservations();

      expect(page.items[0].hasMessageEvidence).toBe(true);
      expect([...page.items[0].evidenceTables].sort()).toEqual(['campaign_channel_messages', 'usage_logs']);
    });

    it('không có dòng nào → rỗng', async () => {
      expect(await listUncertainReservations()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
    });
  });
});

describe('R2: API /api/admin/system/send-quota-reservations', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function loginAs(user) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    return res.body.data.accessToken;
  }

  it('không token → 401; người dùng thường → 403 cho cả GET lẫn POST', async () => {
    expect((await request(app).get('/api/admin/system/send-quota-reservations/uncertain')).status).toBe(401);
    expect((await request(app).post('/api/admin/system/send-quota-reservations/1/reconcile').send({ outcome: 'sent' })).status).toBe(401);

    const plain = await createUser({ role: 'user', username: 'plain_rec' });
    const token = await loginAs(plain);
    const list = await request(app).get('/api/admin/system/send-quota-reservations/uncertain').set('Authorization', `Bearer ${token}`);
    const post = await request(app)
      .post('/api/admin/system/send-quota-reservations/1/reconcile')
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'sent' });
    expect(list.status).toBe(403);
    expect(post.status).toBe(403);
  });

  it('người dùng thường gọi POST trên dòng uncertain thật → 403 và dòng KHÔNG đổi', async () => {
    const owner = await setup({ dailyEmailLimit: 100 });
    const r = await makeUncertain(owner, 'api-403');
    const plain = await createUser({ role: 'user', username: 'plain_rec2' });
    const token = await loginAs(plain);

    const res = await request(app)
      .post(`/api/admin/system/send-quota-reservations/${r.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'not_sent' });

    expect(res.status).toBe(403);
    expect((await getRow(r.id)).status).toBe('uncertain');
  });

  it('admin: GET trả danh sách uncertain; POST sent → 200, consumed, ví trừ 1 lần, ghi đúng 1 dòng nhật ký hệ thống', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin_rec' });
    const token = await loginAs(admin);
    const user = await setupWalletUser();
    const r = await makeUncertain(user, 'api-sent');

    const list = await request(app).get('/api/admin/system/send-quota-reservations/uncertain?limit=10').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0]).toMatchObject({ id: String(r.id), walletQuantity: 1, walletItemKey: 'emails', hasMessageEvidence: false });

    const res = await request(app)
      .post(`/api/admin/system/send-quota-reservations/${r.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'sent', note: 'Đã đối chiếu SMTP' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: String(r.id), status: 'consumed', outcome: 'sent', walletDebited: true });
    expect((await getRow(r.id)).status).toBe('consumed');
    expect(await debitCount(r.id)).toEqual({ n: 1, q: 1 });

    const audit = await db.query(
      "SELECT id_user, category, entity_type, entity_id, details FROM audit_logs WHERE action = 'SEND_QUOTA_RESERVATION_RECONCILED'"
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ id_user: admin.id, category: 'system', entity_type: 'send_quota_reservation' });
    expect(String(audit.rows[0].entity_id)).toBe(String(r.id));
    expect(audit.rows[0].details).toEqual({
      reservationId: String(r.id),
      outcome: 'sent',
      billingUserId: Number(user.id),
      quantity: 1,
      walletQuantity: 1,
      note: 'Đã đối chiếu SMTP',
    });

    const empty = await request(app).get('/api/admin/system/send-quota-reservations/uncertain').set('Authorization', `Bearer ${token}`);
    expect(empty.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('admin: POST not_sent → 200, released; POST lần hai → 409 RESERVATION_NOT_UNCERTAIN và KHÔNG ghi thêm nhật ký', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin_rec2' });
    const token = await loginAs(admin);
    const user = await setup({ dailyEmailLimit: 1 });
    const r = await makeUncertain(user, 'api-notsent');

    const first = await request(app)
      .post(`/api/admin/system/send-quota-reservations/${r.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'not_sent' });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: 'released', outcome: 'not_sent' });
    await expect(reserveSendQuota(params(user, 'api-after'), ENFORCE)).resolves.toMatchObject({ allowed: true });

    const second = await request(app)
      .post(`/api/admin/system/send-quota-reservations/${r.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'not_sent' });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ success: false, code: 'RESERVATION_NOT_UNCERTAIN' });

    const audit = await db.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'SEND_QUOTA_RESERVATION_RECONCILED'");
    expect(audit.rows[0].n).toBe(1);
  });

  it('admin: dòng sending → 409; outcome sai → 400; không tồn tại → 404', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin_rec3' });
    const token = await loginAs(admin);
    const user = await setupWalletUser();
    const sending = await reserveSendQuota(params(user, 'api-sending'), ENFORCE);
    await markSendQuotaSending({ reservationId: sending.id }, ENFORCE);

    const post = (id, body) => request(app)
      .post(`/api/admin/system/send-quota-reservations/${id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect((await post(sending.id, { outcome: 'sent' })).status).toBe(409);
    expect((await post(sending.id, { outcome: 'banana' })).status).toBe(400);
    expect((await post(99999999, { outcome: 'sent' })).status).toBe(404);
    expect((await getRow(sending.id)).status).toBe('sending');
    expect(await debitCount(sending.id)).toEqual({ n: 0, q: 0 });
    const audit = await db.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'SEND_QUOTA_RESERVATION_RECONCILED'");
    expect(audit.rows[0].n).toBe(0);
  });
});
