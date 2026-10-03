/**
 * PLAN_SHADOW_HAN_MUC_GHI_CSDL_2026-10-03: mỗi lượt đánh giá shadow phải để lại dấu vết BỀN
 * (send_quota_shadow_daily + send_quota_shadow_mismatches) và endpoint admin đọc lại được.
 *
 * a) lượt khớp -> 1 dòng daily đúng ngày VN hôm nay, total=1; lượt 2 cùng ngày/kênh -> VẪN 1 dòng, total=2 (ON CONFLICT).
 * b) lệch (luật cũ cache cho phép, luật mới đọc DB từ chối) -> daily legacy_allow_atomic_deny + 1 dòng mismatches.
 * c) GET /api/admin/system/send-quota-shadow -> persisted.daily[].vn_day là chuỗi YYYY-MM-DD, không phải ISO datetime.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';

const prevMode = process.env.SEND_QUOTA_RESERVATION_MODE;
const prevSources = process.env.SEND_QUOTA_RESERVATION_SOURCES;
const prevAllowlist = process.env.SEND_QUOTA_RESERVATION_ALLOWLIST;

const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');
const { _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');
const { reserveSendQuota, resetShadowMismatchMetrics } = await import('../../src/services/quota/sendQuotaReservation.service.js');
const { buildDirectReservationKey } = await import('../../src/services/quota/sendQuotaKey.service.js');

let app;
let seq = 0;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  process.env.SEND_QUOTA_RESERVATION_MODE = 'shadow';
  delete process.env.SEND_QUOTA_RESERVATION_SOURCES;
  delete process.env.SEND_QUOTA_RESERVATION_ALLOWLIST;
  await truncateAll();
  _clearQuotaCache();
  resetShadowMismatchMetrics();
});

afterEach(() => {
  _clearQuotaCache();
});

afterAll(() => {
  const restore = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  restore('SEND_QUOTA_RESERVATION_MODE', prevMode);
  restore('SEND_QUOTA_RESERVATION_SOURCES', prevSources);
  restore('SEND_QUOTA_RESERVATION_ALLOWLIST', prevAllowlist);
});

async function waitFor(fn, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) return v;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function todayVn() {
  const { rows } = await db.query(`SELECT (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d`);
  return rows[0].d;
}

async function reserveEmail(user) {
  seq += 1;
  const key = buildDirectReservationKey({
    channel: 'email', billingUserId: user.id, clientKey: `shadow_persist_${Date.now()}_${seq}`, recipient: `r${seq}@test.vn`,
  });
  return reserveSendQuota({
    userId: user.id, roleCode: 'user', channel: 'email', quantity: 1,
    reservationKey: key, requestFingerprint: 'a'.repeat(64),
  });
}

async function setDailyEmailLimit(userId, limit) {
  const { rows } = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [userId]);
  if (rows[0]?.active_plan_id) {
    await db.query(`UPDATE plans SET daily_email_limit = $2 WHERE id = $1`, [rows[0].active_plan_id, limit]);
  }
}

describe('shadow ghi dấu vết bền', () => {
  it('(a) lượt khớp -> daily 1 dòng đúng ngày VN, lượt 2 cộng dồn (ON CONFLICT), không có mismatches', async () => {
    const user = await createUser({ username: `shadowa${Date.now()}` });
    const expectedDay = await todayVn();

    const r1 = await reserveEmail(user);
    expect(r1.mode).toBe('shadow');
    const row1 = await waitFor(async () => {
      const { rows } = await db.query(`SELECT vn_day::text AS vn_day, channel, total, both_allowed FROM send_quota_shadow_daily`);
      return rows.length ? rows : null;
    });
    expect(row1).toHaveLength(1);
    expect(row1[0]).toMatchObject({ vn_day: expectedDay, channel: 'email', total: 1 });

    await reserveEmail(user);
    const row2 = await waitFor(async () => {
      const { rows } = await db.query(`SELECT total FROM send_quota_shadow_daily`);
      return rows[0]?.total === 2 ? rows : null;
    });
    expect(row2).toHaveLength(1);
    expect(row2[0].total).toBe(2);

    const { rows: mm } = await db.query(`SELECT 1 FROM send_quota_shadow_mismatches`);
    expect(mm).toHaveLength(0);
  });

  it('(b)+(c) lệch -> daily legacy_allow_atomic_deny + 1 dòng mismatches; endpoint trả vn_day dạng chuỗi', async () => {
    const user = await createUser({ username: `shadowb${Date.now()}` });
    await setDailyEmailLimit(user.id, 100);
    // Mồi cache của luật cũ ở hạn mức 100 -> cho phép.
    await reserveEmail(user);
    await waitFor(async () => (await db.query(`SELECT 1 FROM send_quota_shadow_daily`)).rows.length || null);

    // Hạ hạn mức về 0 trong CSDL: luật mới (đọc DB, không cache) từ chối; luật cũ còn cache -> cho phép.
    await setDailyEmailLimit(user.id, 0);
    await db.query(`DELETE FROM send_quota_shadow_daily`);
    const r = await reserveEmail(user);
    expect(r.mode).toBe('shadow');
    expect(r.shadowMismatch).toBe(true);

    const mm = await waitFor(async () => {
      const { rows } = await db.query(
        `SELECT legacy_allowed, atomic_allowed, legacy_detail, channel, source_type, user_id FROM send_quota_shadow_mismatches`,
      );
      return rows.length ? rows : null;
    });
    expect(mm).toHaveLength(1);
    expect(mm[0]).toMatchObject({ legacy_allowed: true, atomic_allowed: false, channel: 'email', source_type: 'direct_email' });
    expect(String(mm[0].user_id)).toBe(String(user.id));
    expect(mm[0].legacy_detail).toBeTruthy();

    const { rows: daily } = await db.query(`SELECT legacy_allow_atomic_deny, total FROM send_quota_shadow_daily`);
    expect(daily[0]).toMatchObject({ legacy_allow_atomic_deny: 1, total: 1 });

    const admin = await createUser({ role: 'admin', username: `shadowadm${Date.now()}` });
    const login = await request(app).post('/api/auth/login').send({ username: admin.username, password: admin.plainPassword });
    const token = login.body.data.accessToken;
    const res = await request(app).get('/api/admin/system/send-quota-shadow').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { persisted } = res.body.data;
    expect(persisted.error).toBeUndefined();
    expect(persisted.daily[0].vn_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(persisted.daily[0].vn_day).toBe(await todayVn());
    expect(persisted.recentMismatches).toHaveLength(1);
    expect(persisted.recentMismatches[0].vn_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(persisted.summary14d).toMatchObject({ total: 1, legacy_allow_atomic_deny: 1 });
  });
});
