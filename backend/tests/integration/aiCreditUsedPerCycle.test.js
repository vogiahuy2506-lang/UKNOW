/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-2 — "lượt AI đã dùng theo kỳ" chạy SQL THẬT trên Postgres.
 *
 * Vì sao cần file này: mọi unit test của phần này giả lập DB (hoặc chỉ ghim chuỗi SQL) nên không thấy được phép cộng
 * thật. Dữ liệu dựng theo đúng hình dạng đã đo trên production 30/09/2026:
 *   - Mua Marketplace: `+giá`, `metadata.feature = 'marketplace_purchase:<id>'` — là tiêu thụ thật, PHẢI được cộng.
 *   - Bán Marketplace: người bán từng được ghi `+90% giá`, `metadata.type = 'marketplace_sale'`, `actor_user_id` NULL —
 *     thu nhập, không phải lượt đã tiêu, PHẢI bị loại (5 dòng cũ còn trong sổ; nơi ghi đã gỡ ở 4ba3b99b).
 *
 * Bảng chân lý cộng tay (đã dùng của chủ 'seller' trong kỳ) nằm ngay trong từng ca — không import từ mã đang test.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import usageTrackingRepository from '../../src/repositories/payment/usageTracking.repository.js';
import aiUsageRepository from '../../src/repositories/admin/aiUsage.repository.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import { getAiUsageOverview } from '../../src/services/admin/aiUsage.service.js';
import { findAllMembers } from '../../src/repositories/admin/adminMembers.repository.js';
import { findTeamOverview } from '../../src/repositories/user/employee.repository.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';

const DAY = 86400000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

/**
 * Ghi thẳng một dòng `usage_logs` với `created_at` tuỳ ý (trackUsage luôn dùng NOW()).
 * metadata === null → SQL NULL (không phải JSON null): kiểm điều kiện loại vẫn NULL-safe.
 */
async function insertUsage({
  idUser,
  actor = null,
  resourceType = 'ai_credit',
  delta = 1,
  metadata = {},
  createdAt = new Date(),
}) {
  await db.query(
    `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      idUser,
      actor,
      resourceType,
      delta,
      createdAt,
      new Date(createdAt.getTime() + 30 * DAY),
      metadata === null ? null : JSON.stringify(metadata),
      createdAt,
    ]
  );
}

const saleRow = (idUser, delta = 900) => insertUsage({
  idUser,
  delta,
  metadata: { type: 'marketplace_sale', listing_id: 9, buyer_id: 1 },
});

const purchaseRow = (idUser, delta, actor = null) => insertUsage({
  idUser,
  actor,
  delta,
  metadata: { feature: 'marketplace_purchase:9', ...(actor ? { actorUserId: actor } : {}) },
});

const answerRow = (idUser, delta = 1, overrides = {}) => insertUsage({
  idUser,
  delta,
  metadata: { feature: 'chatbot_zalo_personal' },
  ...overrides,
});

/** Mốc kích hoạt gói → kỳ 30 ngày của khách (getBillingCycle đọc users.plan_activated_at). */
async function setPlanActivatedAt(userId, date) {
  await db.query(`UPDATE users SET plan_activated_at = $1 WHERE id = $2`, [date, userId]);
}

async function planWithLimit(limit, overrides = {}) {
  return createPlan({
    aiCreditsPerPeriod: limit,
    isActive: true,
    ...overrides,
  });
}

/** Khách có gói `plan`, gói kích hoạt cách đây `activatedDaysAgo` ngày. */
async function customerOnPlan(username, plan, activatedDaysAgo = 45) {
  const user = await createUser({ username, planId: plan.id });
  await setPlanActivatedAt(user.id, daysAgo(activatedDaysAgo));
  return user;
}

// ===========================================================================
// 1. Bộ đọc "đã dùng": getUsageInRange (hàm của cổng chặn) + hai hàm cùng họ
// ===========================================================================
describe('getUsageInRange / getCurrentUsage / getUsageSummary — loại dòng BÁN Marketplace, giữ dòng MUA', () => {
  async function seedLedger() {
    const plan = await planWithLimit(100);
    const user = await createUser({ username: 'ledger_user', planId: plan.id });
    const other = await createUser({ username: 'ledger_other', planId: plan.id });

    // Cộng tay: 3 (3 lượt trả lời) + 5 (MUA marketplace) + 4 (metadata SQL NULL) + 2 (metadata rỗng)
    //          + 7 (type khác 'marketplace_sale') = 21.
    await answerRow(user.id, 1);
    await answerRow(user.id, 1);
    await answerRow(user.id, 1);
    await purchaseRow(user.id, 5, user.id);
    await insertUsage({ idUser: user.id, delta: 4, metadata: null });
    await insertUsage({ idUser: user.id, delta: 2, metadata: {} });
    await insertUsage({ idUser: user.id, delta: 7, metadata: { type: 'marketplace_purchase' } });
    // Phải bị loại:
    await saleRow(user.id, 900); // thu nhập bán hàng
    await insertUsage({ idUser: user.id, delta: 11, createdAt: daysAgo(40) }); // ngoài khung
    await insertUsage({ idUser: other.id, delta: 13 }); // khách khác
    await insertUsage({ idUser: user.id, resourceType: 'ai_token', delta: 1000 }); // loại tài nguyên khác
    return { user, other };
  }

  const from = () => daysAgo(30);
  const to = () => new Date(Date.now() + 60 * 1000);

  it('getUsageInRange = 21: cộng lượt trả lời + dòng MUA + metadata NULL/rỗng, loại dòng bán', async () => {
    const { user } = await seedLedger();
    expect(await usageTrackingRepository.getUsageInRange(user.id, 'ai_credit', from(), to())).toBe(21);
  });

  it('getUsageInRange qua client giao dịch (đường consume / deductCredits) cho cùng kết quả', async () => {
    const { user } = await seedLedger();
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      expect(await usageTrackingRepository.getUsageInRange(user.id, 'ai_credit', from(), to(), client)).toBe(21);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('người bán chỉ có dòng bán → đã dùng = 0 (bán được hàng không làm mất hạn mức)', async () => {
    const plan = await planWithLimit(100);
    const seller = await createUser({ username: 'only_sale', planId: plan.id });
    await saleRow(seller.id, 414);
    await saleRow(seller.id, 900);
    expect(await usageTrackingRepository.getUsageInRange(seller.id, 'ai_credit', from(), to())).toBe(0);
  });

  it('dòng MUA đứng một mình vẫn được cộng đủ (không loại theo tiền tố marketplace)', async () => {
    const plan = await planWithLimit(1000);
    const buyer = await createUser({ username: 'only_purchase', planId: plan.id });
    await purchaseRow(buyer.id, 1000, buyer.id);
    expect(await usageTrackingRepository.getUsageInRange(buyer.id, 'ai_credit', from(), to())).toBe(1000);
  });

  it('getCurrentUsage (tháng dương lịch) cũng loại dòng bán: 21', async () => {
    const { user } = await seedLedger();
    expect(await usageTrackingRepository.getCurrentUsage(user.id, 'ai_credit')).toBe(21);
  });

  it('getUsageSummary: ai_credit = 21, ai_token giữ nguyên 1000', async () => {
    const { user } = await seedLedger();
    const rows = await usageTrackingRepository.getUsageSummary(user.id);
    const byType = Object.fromEntries(rows.map((row) => [row.resource_type, Number(row.total_usage)]));
    expect(byType).toEqual({ ai_credit: 21, ai_token: 1000 });
  });
});

// ===========================================================================
// 2. Cổng chặn thật: bán được hàng không được làm người bán mất hạn mức / bị trừ ví
// ===========================================================================
describe('cổng chặn aiCreditMeter — dòng bán Marketplace không được tính vào hạn mức', () => {
  it('hạn mức 100, đã dùng thật 50, có dòng bán 900 → vẫn được dùng AI (used = 50), consume KHÔNG trừ ví', async () => {
    const plan = await planWithLimit(100);
    const seller = await customerOnPlan('seller', plan, 10);
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await answerRow(seller.id, 1, { createdAt: daysAgo(2) });
    }
    await saleRow(seller.id, 900);

    const ctx = await aiCreditMeter.assertAvailable(seller.id);
    expect(ctx).toMatchObject({ skip: false, limit: 100, used: 50 });

    await aiCreditMeter.consume(seller.id, { feature: 'test', creditContext: ctx });

    // Trước bản sửa: usedBefore = 950 ≥ 100 → insertTopupDebit → trừ ví tiền thật của người bán.
    const { rows: debits } = await db.query(`SELECT COUNT(*)::int AS n FROM topup_debits`);
    expect(debits[0].n).toBe(0);
    const { rows: ledger } = await db.query(
      `SELECT COUNT(*)::int AS n FROM usage_logs WHERE resource_type = 'ai_credit' AND id_user = $1`,
      [seller.id]
    );
    expect(ledger[0].n).toBe(50 + 1 + 1); // 50 lượt + 1 dòng bán + 1 lượt vừa consume
  });

  it('đối chứng: dùng thật đủ hạn mức (60 MUA marketplace + 40 trả lời = 100) → bị chặn, vì MUA là tiêu thụ thật', async () => {
    const plan = await planWithLimit(100);
    const buyer = await customerOnPlan('buyer', plan, 10);
    await purchaseRow(buyer.id, 60, buyer.id);
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await answerRow(buyer.id, 1, { createdAt: daysAgo(1) });
    }

    await expect(aiCreditMeter.assertAvailable(buyer.id)).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      used: 100,
      limit: 100,
    });
  });
});

// ===========================================================================
// 3. API hồ sơ: aiCreditsUsed loại dòng bán + trả kỳ hiện tại (ISO)
// ===========================================================================
describe('GET /api/users/profile — aiCreditsUsed loại dòng bán, kèm aiCreditCycleStart/End', () => {
  async function loginAs(user) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.plainPassword });
    if (!res.body?.data?.accessToken) throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
    return res.body.data.accessToken;
  }

  it('gói kích hoạt 45 ngày trước → kỳ hiện tại = [kích hoạt + 30 ngày, kích hoạt + 60 ngày]', async () => {
    const plan = await planWithLimit(100);
    const anchor = daysAgo(45);
    const seller = await createUser({ username: 'profile_seller', planId: plan.id });
    await setPlanActivatedAt(seller.id, anchor);

    await answerRow(seller.id, 1, { createdAt: daysAgo(3) });
    await answerRow(seller.id, 1, { createdAt: daysAgo(2) });
    await answerRow(seller.id, 6, { createdAt: daysAgo(40) }); // kỳ TRƯỚC → không tính
    await saleRow(seller.id, 900);

    const token = await loginAs(seller);
    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.aiCreditsUsed).toBe(2);
    expect(res.body.data.aiCreditsPerPeriod).toBe(100);
    expect(res.body.data.aiCreditCycleStart).toBe(new Date(anchor.getTime() + 30 * DAY).toISOString());
    expect(res.body.data.aiCreditCycleEnd).toBe(new Date(anchor.getTime() + 60 * DAY).toISOString());
  });

  it('chưa có gói → aiCreditCycleStart/End = null', async () => {
    const user = await createUser({ username: 'profile_noplan', withPlan: false });
    const token = await loginAs(user);
    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.aiCreditCycleStart).toBeNull();
    expect(res.body.data.aiCreditCycleEnd).toBeNull();
  });
});

// ===========================================================================
// 4. Admin Chi phí AI: đã dùng trong KỲ HIỆN TẠI của từng khách, không theo cửa sổ 7/30/90
// ===========================================================================
describe('getAiUsageOverview — lượt AI theo gói, kỳ hiện tại của từng khách', () => {
  /**
   * Gói P (hạn mức 100), gói kích hoạt 45 ngày trước → kỳ hiện tại bắt đầu 15 ngày trước.
   *   c1 = 10 : 4 lượt cách 3 ngày + 6 lượt cách 12 ngày (nằm NGOÀI cửa sổ 7 ngày) + 30 lượt kỳ trước (cách 25 ngày)
   *   c2 = 50
   *   c3 = 90 : + dòng bán 900 (loại)
   *   c4    : chỉ có dòng bán → không phải khách "có dùng"
   *   c5    : chỉ có lượt của kỳ trước → có trong tập 31 ngày nhưng đã dùng 0 kỳ này
   *   c6    : KHÔNG có gói → bị bỏ
   * Gói U (không giới hạn): c7 = 300 (lượt trả lời) + c8 = 200 (chỉ có dòng MUA marketplace — vẫn là khách có dùng).
   * Gói V (hạn mức 200) — hai khách sát mép tập 31 ngày mà số cũ/tập hẹp sẽ làm rơi:
   *   v1 = 40 : gói kích hoạt 45 ngày trước (kỳ bắt đầu 15 ngày trước), dùng cách 14 ngày → ngoài 7 ngày nhưng trong kỳ
   *   v2 = 160: dùng cách 2 ngày
   *   v3 = 30 : gói kích hoạt 29,5 ngày trước (kỳ 0 mới qua 29,5 ngày), dùng cách 29 ngày → ngoài 28 ngày, trong 31 ngày
   * Cộng tay cho gói P: 3 khách (10, 50, 90) → tổng 150, p90 = 50 + 0,8 × (90 − 50) = 82, 82/100 = 82,0%, ≥ 80% = 1 khách.
   * Cộng tay cho gói V: 3 khách (30, 40, 160) → tổng 230, p90 = 40 + 0,8 × (160 − 40) = 136, 136/200 = 68,0%,
   *   ≥ 80% (160 lượt) = 1 khách (v2).
   */
  async function seedOverview() {
    const planP = await planWithLimit(100, { code: 'plan_p', name: 'Plan P' });
    const planU = await planWithLimit(null, { code: 'plan_u', name: 'Plan U' });
    const planV = await planWithLimit(200, { code: 'plan_v', name: 'Plan V' });

    const c1 = await customerOnPlan('c1', planP);
    await answerRow(c1.id, 4, { createdAt: daysAgo(3) });
    await answerRow(c1.id, 6, { createdAt: daysAgo(12) });
    await answerRow(c1.id, 30, { createdAt: daysAgo(25) });

    const c2 = await customerOnPlan('c2', planP);
    await answerRow(c2.id, 50, { createdAt: daysAgo(5) });

    const c3 = await customerOnPlan('c3', planP);
    await answerRow(c3.id, 90, { createdAt: daysAgo(1) });
    await insertUsage({
      idUser: c3.id, delta: 900, createdAt: daysAgo(2), metadata: { type: 'marketplace_sale', listing_id: 1 },
    });

    const c4 = await customerOnPlan('c4', planP);
    await insertUsage({
      idUser: c4.id, delta: 900, createdAt: daysAgo(2), metadata: { type: 'marketplace_sale', listing_id: 1 },
    });

    const c5 = await customerOnPlan('c5', planP);
    await answerRow(c5.id, 77, { createdAt: daysAgo(25) });

    const c6 = await createUser({ username: 'c6', withPlan: false });
    await answerRow(c6.id, 500, { createdAt: daysAgo(3) });

    const c7 = await customerOnPlan('c7', planU);
    await answerRow(c7.id, 300, { createdAt: daysAgo(4) });

    const c8 = await customerOnPlan('c8', planU);
    await purchaseRow(c8.id, 200, c8.id);

    const v1 = await customerOnPlan('v1', planV, 45);
    await answerRow(v1.id, 40, { createdAt: daysAgo(14) });

    const v2 = await customerOnPlan('v2', planV, 45);
    await answerRow(v2.id, 160, { createdAt: daysAgo(2) });

    const v3 = await customerOnPlan('v3', planV, 29.5);
    await answerRow(v3.id, 30, { createdAt: daysAgo(29) });

    return { planP, planU, planV };
  }

  const planRow = (byPlan, code) => byPlan.find((plan) => plan.planCode === code);

  it('gói P: 3 khách 10/50/90 → tổng 150, p90 = 82, % = 82, gần trần = 1 — không tính dòng bán, kỳ trước, khách không gói', async () => {
    await seedOverview();
    const { byPlan } = await getAiUsageOverview({ range: '30d' });
    expect(planRow(byPlan, 'plan_p')).toMatchObject({
      aiCreditsPerPeriod: 100,
      creditUserCount: 3,
      totalCredits: 150,
      p90UserCredits: 82,
      quotaUsagePctAtP90: 82,
      usersNearLimit: 1,
    });
  });

  it('gói V: khách sát mép tập 31 ngày (dùng cách 14 và 29 ngày, vẫn trong kỳ) được tính → tổng 230, p90 = 136, % = 68, gần trần = 1', async () => {
    await seedOverview();
    const { byPlan } = await getAiUsageOverview({ range: '30d' });
    expect(planRow(byPlan, 'plan_v')).toMatchObject({
      aiCreditsPerPeriod: 200,
      creditUserCount: 3,
      totalCredits: 230,
      p90UserCredits: 136,
      quotaUsagePctAtP90: 68,
      usersNearLimit: 1,
    });
  });

  it('bộ lọc "Tháng này" và "30 ngày qua" cho CÙNG các số lượt AI (bản cũ: ba nút ba con số)', async () => {
    await seedOverview();
    const creditFields = ({ byPlan }, code) => {
      const plan = planRow(byPlan, code);
      return {
        creditUserCount: plan.creditUserCount,
        totalCredits: plan.totalCredits,
        p90UserCredits: plan.p90UserCredits,
        quotaUsagePctAtP90: plan.quotaUsagePctAtP90,
        usersNearLimit: plan.usersNearLimit,
      };
    };
    const month = await getAiUsageOverview({ range: 'month' });
    const last30 = await getAiUsageOverview({ range: '30d' });
    expect(creditFields(month, 'plan_p')).toEqual({
      creditUserCount: 3, totalCredits: 150, p90UserCredits: 82, quotaUsagePctAtP90: 82, usersNearLimit: 1,
    });
    expect(creditFields(month, 'plan_v')).toEqual({
      creditUserCount: 3, totalCredits: 230, p90UserCredits: 136, quotaUsagePctAtP90: 68, usersNearLimit: 1,
    });
    for (const code of ['plan_p', 'plan_u', 'plan_v']) {
      expect(creditFields(last30, code)).toEqual(creditFields(month, code));
    }
  });

  it('gói không giới hạn: c7 = 300 (trả lời) + c8 = 200 (chỉ có dòng MUA) → 2 khách, tổng 500, pct = null, gần trần = 0; khách không gói không xuất hiện ở đâu', async () => {
    await seedOverview();
    const { byPlan } = await getAiUsageOverview();
    expect(planRow(byPlan, 'plan_u')).toMatchObject({
      aiCreditsPerPeriod: null,
      creditUserCount: 2,
      totalCredits: 500,
      quotaUsagePctAtP90: null,
      usersNearLimit: 0,
    });
    // 500 lượt của c6 (không gói) không rơi vào gói nào: 150 (P) + 500 (U) + 230 (V)
    expect(byPlan.reduce((sum, plan) => sum + plan.totalCredits, 0)).toBe(150 + 500 + 230);
  });

  it('tập khách có dùng: loại khách chỉ có dòng bán (c4) và khách không gói (c6); giữ khách chỉ có dòng MUA (c8)', async () => {
    await seedOverview();
    const customers = await aiUsageRepository.listCreditCustomers({ lookbackDays: 31 });
    const names = (await db.query(`SELECT id, username FROM users WHERE id = ANY($1::bigint[])`, [customers.map((c) => c.user_id)]))
      .rows.map((row) => row.username).sort();
    // c5 có (lượt kỳ trước trong 31 ngày) nhưng đã dùng 0 kỳ này; v3 dùng cách 29 ngày vẫn trong 31 ngày
    expect(names).toEqual(['c1', 'c2', 'c3', 'c5', 'c7', 'c8', 'v1', 'v2', 'v3']);
  });
});

// ===========================================================================
// 5. Admin Thành viên: cột "% AI" loại dòng bán
// ===========================================================================
describe('admin Thành viên — aiCreditsUsedThisMonth loại dòng bán Marketplace', () => {
  it('5 lượt + 20 (MUA) = 25; dòng bán 900 không cộng', async () => {
    const plan = await planWithLimit(100);
    const seller = await createUser({ username: 'member_seller', planId: plan.id });
    await answerRow(seller.id, 5);
    await purchaseRow(seller.id, 20, seller.id);
    await saleRow(seller.id, 900);

    const members = await findAllMembers();
    const row = members.find((member) => Number(member.id) === Number(seller.id));
    expect(row).toBeDefined();
    expect(row.aiCreditsUsedThisMonth).toBe(25);
    expect(row.aiCreditsLimit).toBe(100);
  });
});

// ===========================================================================
// 6. Hoạt động nhóm: lượt AI của nhân viên chỉ tính trong ví của CHỦ đang xem
// ===========================================================================
describe('Hoạt động nhóm — aiCreditsThisMonth khoá theo chủ', () => {
  async function addMember(ownerId, employeeId) {
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status, origin, accepted_at)
       VALUES ($1, $2, 'active', 'created', NOW())`,
      [ownerId, employeeId]
    );
  }

  it('nhân viên làm cho 2 chủ + dùng AI trong không gian riêng: mỗi chủ chỉ thấy phần trong ví của mình', async () => {
    const plan = await planWithLimit(1000);
    const owner1 = await createUser({ username: 'team_owner1', planId: plan.id });
    const owner2 = await createUser({ username: 'team_owner2', planId: plan.id });
    const staff = await createUser({ username: 'team_staff', withPlan: false });
    await addMember(owner1.id, staff.id);
    await addMember(owner2.id, staff.id);

    // Ví chủ 1: 3 lượt (staff làm) — cộng tay = 3
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await answerRow(owner1.id, 1, { actor: staff.id });
    }
    // Ví chủ 2: 4 lượt (staff làm)
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await answerRow(owner2.id, 1, { actor: staff.id });
    }
    // Không gian RIÊNG của staff: 5 lượt (id_user = actor = staff)
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await answerRow(staff.id, 1, { actor: staff.id });
    }
    // Dòng bán của chủ 1 (actor NULL) — không thuộc nhân viên nào
    await saleRow(owner1.id, 900);

    const forOwner1 = (await findTeamOverview(owner1.id)).find((row) => Number(row.id) === Number(staff.id));
    const forOwner2 = (await findTeamOverview(owner2.id)).find((row) => Number(row.id) === Number(staff.id));
    // Trước bản sửa: cả hai đều = 12 (3 + 4 + 5).
    expect(forOwner1.aiCreditsThisMonth).toBe(3);
    expect(forOwner2.aiCreditsThisMonth).toBe(4);
  });

  it('lọc theo một nhân viên (employeeId) vẫn khoá theo chủ', async () => {
    const plan = await planWithLimit(1000);
    const owner1 = await createUser({ username: 'team_o1', planId: plan.id });
    const owner2 = await createUser({ username: 'team_o2', planId: plan.id });
    const staff = await createUser({ username: 'team_s', withPlan: false });
    await addMember(owner1.id, staff.id);
    await addMember(owner2.id, staff.id);
    await answerRow(owner1.id, 2, { actor: staff.id });
    await answerRow(owner2.id, 9, { actor: staff.id });

    const rows = await findTeamOverview(owner1.id, { employeeId: staff.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].aiCreditsThisMonth).toBe(2);
  });
});
