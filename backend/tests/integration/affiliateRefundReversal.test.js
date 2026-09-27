/**
 * PLAN_HOAN_TIEN_DON_HANG_2026-09-27 mục 2.1 — event doanh thu của đơn đã hoàn (reversed_at) bị loại
 * khỏi MỌI chỗ tính doanh thu giới thiệu. Một test cho TỪNG chỗ trong 5 chỗ; mỗi test có một event
 * còn hiệu lực làm đối chứng để phép so không rỗng nghĩa.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, createOrder } = await import('./helpers/db.js');
const { closeAffiliateMonth } = await import('../../src/services/affiliate/affiliateMonthClosing.service.js');
const {
  getAffiliateOverview,
  getAdminAffiliatePeriods,
  resolveCurrentMonthKey,
} = await import('../../src/services/affiliate/affiliateWithdrawal.service.js');

const MONTH = '2026-08';
let originalClosingFlag;
let seq = 0;

beforeEach(async () => {
  await truncateAll();
  originalClosingFlag = process.env.AFFILIATE_CLOSING_ENABLED;
  process.env.AFFILIATE_CLOSING_ENABLED = 'true';
});

afterEach(() => {
  if (originalClosingFlag !== undefined) process.env.AFFILIATE_CLOSING_ENABLED = originalClosingFlag;
  else delete process.env.AFFILIATE_CLOSING_ENABLED;
});

async function person(prefix, { phone } = {}) {
  seq += 1;
  return createUser({ username: `${prefix}${seq}`, withPlan: false, ...(phone === null ? { phone: null } : {}) });
}

async function revenueEvent({ referrer, buyer, amount, monthKey = MONTH, reversed = false, paymentMethod = 'payos' }) {
  const plan = await createPlan({ price: amount });
  const order = await createOrder({
    planId: plan.id, userId: buyer.id, userEmail: buyer.email, amount,
    status: reversed ? 'refunded' : 'success', paymentMethod,
  });
  const { rows } = await db.query(
    `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key, reversed_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [referrer.id, buyer.id, order.id, amount, monthKey, reversed ? new Date() : null]
  );
  return { order, event: rows[0] };
}

describe('mục 2.1 — loại event đã đảo khỏi 5 chỗ tính doanh thu', () => {
  it('chỗ 1 (đóng sổ, danh sách ứng viên): đối tác CHỈ có event đã đảo → không sinh period 0đ', async () => {
    const onlyReversed = await person('ref-rev');
    const control = await person('ref-ok');
    const buyer = await person('buyer');
    await revenueEvent({ referrer: onlyReversed, buyer, amount: 299000, reversed: true });
    await revenueEvent({ referrer: control, buyer, amount: 299000 });

    const res = await closeAffiliateMonth(MONTH, { force: true });
    expect(res.processedReferrers).toBe(1);

    const { rows } = await db.query(
      `SELECT referrer_user_id FROM affiliate_periods WHERE month_key = $1`, [MONTH]
    );
    expect(rows.map((r) => Number(r.referrer_user_id))).toEqual([Number(control.id)]);
  });

  it('chỗ 2 (đóng sổ, gross): 12tr còn hiệu lực + 10tr đã đảo → period 12tr, bậc 15%, hoa hồng 1.800.000', async () => {
    const referrer = await person('ref');
    const buyer = await person('buyer');
    await revenueEvent({ referrer, buyer, amount: 12_000_000 });
    await revenueEvent({ referrer, buyer, amount: 10_000_000, reversed: true });

    await closeAffiliateMonth(MONTH, { force: true });
    const { rows } = await db.query(
      `SELECT gross_revenue, rate_percent, commission_amount FROM affiliate_periods WHERE referrer_user_id = $1`,
      [referrer.id]
    );
    expect(Number(rows[0].gross_revenue)).toBe(12_000_000);
    expect(Number(rows[0].rate_percent)).toBe(15);
    expect(Number(rows[0].commission_amount)).toBe(1_800_000);
    const ledger = await db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS s FROM affiliate_ledger WHERE user_id = $1`, [referrer.id]);
    expect(Number(ledger.rows[0].s)).toBe(1_800_000);
  });

  it('chỗ 3 (trang đối tác, doanh thu tháng này): không đếm event đã đảo', async () => {
    const referrer = await person('ref');
    const buyer = await person('buyer');
    const month = resolveCurrentMonthKey();
    await revenueEvent({ referrer, buyer, amount: 500_000, monthKey: month });
    await revenueEvent({ referrer, buyer, amount: 299_000, monthKey: month, reversed: true });

    const overview = await getAffiliateOverview(referrer.id);
    expect(overview.currentMonthGross).toBe(500_000);
  });

  it('chỗ 4 (trang đối tác, mục chờ đủ điều kiện): event đã đảo của người mua chưa có SĐT không hiện', async () => {
    const referrer = await person('ref');
    const noPhone = await person('buyer-nophone', { phone: null });
    const kept = await revenueEvent({ referrer, buyer: noPhone, amount: 199_000 });
    await revenueEvent({ referrer, buyer: noPhone, amount: 299_000, reversed: true });

    const overview = await getAffiliateOverview(referrer.id);
    expect(overview.pendingApproval.pendingRevenue).toBe(199_000);
    expect(overview.pendingApproval.events.map((e) => Number(e.orderId))).toEqual([Number(kept.order.id)]);
  });

  it('chỗ 5 (trang admin, manual_revenue): event manual đã đảo không cộng vào', async () => {
    const referrer = await person('ref');
    const buyer = await person('buyer');
    await revenueEvent({ referrer, buyer, amount: 1_000_000, paymentMethod: 'manual' });
    await revenueEvent({ referrer, buyer, amount: 700_000, paymentMethod: 'manual', reversed: true });
    await db.query(
      `INSERT INTO affiliate_periods (referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount)
       VALUES ($1, $2, 1000000, 1, 10, 100000)`,
      [referrer.id, MONTH]
    );

    const periods = await getAdminAffiliatePeriods({ monthKey: MONTH });
    expect(periods).toHaveLength(1);
    expect(periods[0].manualRevenue).toBe(1_000_000);
  });
});
