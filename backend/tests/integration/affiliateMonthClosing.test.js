/**
 * Integration tests cho Affiliate PR-A3: Đóng sổ tháng + ví hoa hồng đối tác.
 *
 * Kiểm tra đầy đủ:
 * a. Chạy job 2 lần cho cùng một tháng → affiliate_periods 1 dòng, ledger 1 bút toán, SUM(amount) KHÔNG đổi (idempotency).
 * b. Tách biệt doanh thu giữa các tháng: Tháng 9 hoa hồng 1tr chưa rút, tháng 10 doanh thu 5tr → tháng 10 tính bậc trên 5tr (10%),
 *    KHÔNG phải 6tr. Số dư = 1tr + 500k.
 * c. Người mua chưa có SĐT lúc đóng sổ → KHÔNG vào gross. Sau đó cho họ SĐT, chạy lại job → ĐƯỢC tính, có bút toán adjustment.
 * d. Event về muộn đẩy tháng vượt bậc: đã đóng sổ với gross 9.900.000 (10%, 990.000đ), thêm event 200.000 →
 *    gross 10.100.000 thành bậc 2 (15%), hoa hồng đúng 1.515.000đ, adjustment = +525.000đ (KHÔNG phải 200.000 × 10%).
 * e. Job đóng sổ khi AFFILIATE_CLOSING_ENABLED chưa bật → không làm gì (skipped: true).
 * f. findPurgeBlockers phát hiện hoạt động trong affiliate_periods và affiliate_ledger và chặn xoá user.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, createOrder } from './helpers/db.js';
import {
  closeAffiliateMonth,
  getAffiliateBalance,
} from '../../src/services/affiliate/affiliateMonthClosing.service.js';
import { findPurgeBlockers } from '../../src/repositories/admin/adminMembers.repository.js';

let originalClosingFlag;

beforeEach(async () => {
  await truncateAll();
  originalClosingFlag = process.env.AFFILIATE_CLOSING_ENABLED;
  process.env.AFFILIATE_CLOSING_ENABLED = 'true';
});

afterEach(() => {
  if (originalClosingFlag !== undefined) {
    process.env.AFFILIATE_CLOSING_ENABLED = originalClosingFlag;
  } else {
    delete process.env.AFFILIATE_CLOSING_ENABLED;
  }
});

/** Helper tạo event doanh thu trực tiếp */
async function insertRevenueEvent({ referrerId, buyerId, amount, monthKey, orderCode }) {
  const plan = await createPlan({ name: `Plan-${orderCode}`, price: amount });
  const order = await createOrder({
    orderCode,
    planId: plan.id,
    userId: buyerId,
    userEmail: `buyer-${orderCode}@test.com`,
    amount,
    status: 'success',
    paymentMethod: 'payos',
  });

  const { rows } = await db.query(
    `INSERT INTO affiliate_revenue_events (
       referrer_user_id, buyer_user_id, order_id, amount, month_key
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [referrerId, buyerId, order.id, amount, monthKey]
  );
  return rows[0];
}

describe('Affiliate PR-A3 — Đóng sổ tháng + Ví hoa hồng', () => {
  it('a. Chạy job 2 lần cho cùng một tháng → affiliate_periods 1 dòng, ledger 1 bút toán, SUM(amount) KHÔNG đổi', async () => {
    const referrer = await createUser({ email: 'ref-a@test.com', username: 'ref_a' });
    const buyer = await createUser({
      email: 'buyer-a@test.com',
      username: 'buyer_a',
      phone: '0901000001',
    });

    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 5000000,
      monthKey: '2026-09',
      orderCode: 90001,
    });

    // Lần chạy 1: Đóng sổ tháng 2026-09
    const res1 = await closeAffiliateMonth('2026-09');
    expect(res1.status).toBe('success');
    expect(res1.skipped).toBe(false);
    expect(res1.insertedPeriods).toBe(1);
    expect(res1.adjustedPeriods).toBe(0);
    expect(res1.totalCommission).toBe(500000); // 5tr * 10% = 500k

    const { rows: periods1 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(periods1).toHaveLength(1);
    expect(Number(periods1[0].gross_revenue)).toBe(5000000);
    expect(periods1[0].tier_level).toBe(1);
    expect(periods1[0].rate_percent).toBe(10);
    expect(Number(periods1[0].commission_amount)).toBe(500000);

    const { rows: ledger1 } = await db.query(
      'SELECT * FROM affiliate_ledger WHERE user_id = $1 ORDER BY id',
      [referrer.id]
    );
    expect(ledger1).toHaveLength(1);
    expect(ledger1[0].entry_type).toBe('commission');
    expect(Number(ledger1[0].amount)).toBe(500000);
    expect(ledger1[0].ref_id).toBe(periods1[0].id);

    const balance1 = await getAffiliateBalance(referrer.id);
    expect(balance1).toBe(500000);

    // Lần chạy 2: Chạy lại đóng sổ cùng tháng 2026-09 (không có event mới)
    const res2 = await closeAffiliateMonth('2026-09');
    expect(res2.status).toBe('noop');
    expect(res2.insertedPeriods).toBe(0);
    expect(res2.adjustedPeriods).toBe(0);

    const { rows: periods2 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(periods2).toHaveLength(1);

    const { rows: ledger2 } = await db.query(
      'SELECT * FROM affiliate_ledger WHERE user_id = $1',
      [referrer.id]
    );
    expect(ledger2).toHaveLength(1); // Không nhân đôi bút toán

    const balance2 = await getAffiliateBalance(referrer.id);
    expect(balance2).toBe(500000); // Số dư không đổi
  });

  it('b. Tháng 9 hoa hồng 1tr chưa rút, tháng 10 doanh thu 5tr → tháng 10 tính bậc trên 5tr (10%), KHÔNG phải 6tr. Số dư = 1tr + 500k', async () => {
    const referrer = await createUser({ email: 'ref-b@test.com', username: 'ref_b' });
    const buyer = await createUser({
      email: 'buyer-b@test.com',
      username: 'buyer_b',
      phone: '0901000002',
    });

    // Giả lập tháng 9: người này có sẵn 1 bút toán hoa hồng 1.000.000đ trong ledger (chưa rút)
    // Tạo sẵn affiliate_periods tháng 9
    const { rows: periodSep } = await db.query(
      `INSERT INTO affiliate_periods (
         referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount
       ) VALUES ($1, '2026-09', 10000000, 2, 10, 1000000)
       RETURNING id`,
      [referrer.id]
    );
    await db.query(
      `INSERT INTO affiliate_ledger (
         user_id, entry_type, amount, ref_type, ref_id, note
       ) VALUES ($1, 'commission', 1000000, 'period', $2, 'Hoa hồng giới thiệu tháng 2026-09')`,
      [referrer.id, periodSep[0].id]
    );

    const balanceBeforeOct = await getAffiliateBalance(referrer.id);
    expect(balanceBeforeOct).toBe(1000000);

    // Tháng 10: phát sinh doanh thu 5.000.000đ
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 5000000,
      monthKey: '2026-10',
      orderCode: 90002,
    });

    // Đóng sổ tháng 10
    const resOct = await closeAffiliateMonth('2026-10');
    expect(resOct.insertedPeriods).toBe(1);

    const { rows: periodOct } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-10']
    );
    expect(periodOct).toHaveLength(1);
    // Bậc của tháng 10 chỉ tính trên 5tr (bậc 1: 10%), KHÔNG cộng dồn tháng 9 thành 6tr
    expect(Number(periodOct[0].gross_revenue)).toBe(5000000);
    expect(periodOct[0].tier_level).toBe(1);
    expect(periodOct[0].rate_percent).toBe(10);
    expect(Number(periodOct[0].commission_amount)).toBe(500000);

    // Số dư ví = 1.000.000đ (tháng 9) + 500.000đ (tháng 10) = 1.500.000đ
    const balanceAfterOct = await getAffiliateBalance(referrer.id);
    expect(balanceAfterOct).toBe(1500000);
  });

  it('c. Người mua chưa có SĐT lúc đóng sổ → KHÔNG vào gross. Sau đó cho họ SĐT, chạy lại job → ĐƯỢC tính, có bút toán adjustment', async () => {
    const referrer = await createUser({ email: 'ref-c@test.com', username: 'ref_c' });
    // Người mua ban đầu KHÔNG CÓ SĐT (phone = null)
    const buyer = await createUser({
      email: 'buyer-c@test.com',
      username: 'buyer_c',
      phone: null,
    });

    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 5000000,
      monthKey: '2026-09',
      orderCode: 90003,
    });

    // Lần 1: Đóng sổ tháng 9 khi người mua chưa có SĐT
    await closeAffiliateMonth('2026-09');

    const { rows: period1 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(period1).toHaveLength(1);
    // Không tính vào gross -> gross_revenue = 0, commission = 0
    expect(Number(period1[0].gross_revenue)).toBe(0);
    expect(Number(period1[0].commission_amount)).toBe(0);

    const balance1 = await getAffiliateBalance(referrer.id);
    expect(balance1).toBe(0);

    // Sau đó người mua bổ sung số điện thoại
    await db.query("UPDATE users SET phone = '0901000003' WHERE id = $1", [buyer.id]);

    // Lần 2: Chạy lại job đóng sổ tháng 9
    const res2 = await closeAffiliateMonth('2026-09');
    expect(res2.adjustedPeriods).toBe(1);
    expect(res2.totalAdjustment).toBe(500000);

    const { rows: period2 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(Number(period2[0].gross_revenue)).toBe(5000000);
    expect(Number(period2[0].commission_amount)).toBe(500000);

    // Bút toán trong ledger phải là 'adjustment'
    const { rows: ledger } = await db.query(
      'SELECT * FROM affiliate_ledger WHERE user_id = $1',
      [referrer.id]
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].entry_type).toBe('adjustment');
    expect(Number(ledger[0].amount)).toBe(500000);
    expect(ledger[0].note).toContain('doanh thu về muộn cho tháng 2026-09');

    const balance2 = await getAffiliateBalance(referrer.id);
    expect(balance2).toBe(500000);
  });

  it('d. Event về muộn đẩy tháng vượt bậc: gross 9.9tr (10%, 990k), thêm event 200k → gross 10.1tr thành bậc 2 (15%), hoa hồng 1.515k, adjustment = +525k', async () => {
    const referrer = await createUser({ email: 'ref-d@test.com', username: 'ref_d' });
    const buyer1 = await createUser({
      email: 'buyer-d1@test.com',
      username: 'buyer_d1',
      phone: '0901000004',
    });

    // Ban đầu có đơn 9.900.000đ
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer1.id,
      amount: 9900000,
      monthKey: '2026-09',
      orderCode: 90004,
    });

    // Lần 1: Đóng sổ tháng 9
    await closeAffiliateMonth('2026-09');

    const { rows: period1 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(Number(period1[0].gross_revenue)).toBe(9900000);
    expect(period1[0].tier_level).toBe(1);
    expect(period1[0].rate_percent).toBe(10);
    expect(Number(period1[0].commission_amount)).toBe(990000); // 9.9tr * 10% = 990k

    const balance1 = await getAffiliateBalance(referrer.id);
    expect(balance1).toBe(990000);

    // Event về muộn: phát sinh thêm đơn 200.000đ cho tháng 9
    const buyer2 = await createUser({
      email: 'buyer-d2@test.com',
      username: 'buyer_d2',
      phone: '0901000005',
    });
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer2.id,
      amount: 200000,
      monthKey: '2026-09',
      orderCode: 90005,
    });

    // Lần 2: Chạy lại đóng sổ đối soát tháng 9
    const res2 = await closeAffiliateMonth('2026-09');
    expect(res2.adjustedPeriods).toBe(1);
    // Tổng mới = 10.100.000đ -> Bậc 2 (15%) -> Hoa hồng mới = 1.515.000đ
    // Adjustment delta = 1.515.000 - 990.000 = +525.000đ (KHÔNG PHẢI 200.000 * 10% = 20.000đ)
    expect(res2.totalAdjustment).toBe(525000);

    const { rows: period2 } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(Number(period2[0].gross_revenue)).toBe(10100000);
    expect(period2[0].tier_level).toBe(2);
    expect(period2[0].rate_percent).toBe(15);
    expect(Number(period2[0].commission_amount)).toBe(1515000);

    const { rows: ledger } = await db.query(
      'SELECT * FROM affiliate_ledger WHERE user_id = $1 ORDER BY id',
      [referrer.id]
    );
    expect(ledger).toHaveLength(2);
    expect(ledger[0].entry_type).toBe('commission');
    expect(Number(ledger[0].amount)).toBe(990000);
    expect(ledger[1].entry_type).toBe('adjustment');
    expect(Number(ledger[1].amount)).toBe(525000);

    // Tổng số dư ví = 990.000 + 525.000 = 1.515.000đ
    const balance2 = await getAffiliateBalance(referrer.id);
    expect(balance2).toBe(1515000);
  });

  it('e. Job đóng sổ khi AFFILIATE_CLOSING_ENABLED chưa bật → không làm gì nhưng vẫn recordRun minh chứng cron sống', async () => {
    process.env.AFFILIATE_CLOSING_ENABLED = 'false';

    const referrer = await createUser({ email: 'ref-e@test.com', username: 'ref_e' });
    const buyer = await createUser({
      email: 'buyer-e@test.com',
      username: 'buyer_e',
      phone: '0901000006',
    });
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 5000000,
      monthKey: '2026-09',
      orderCode: 90006,
    });

    const cronJobRunRepository = await import('../../src/repositories/admin/cronJobRun.repository.js');
    const { AFFILIATE_MONTH_CLOSING_JOB_CODE } = await import('../../src/services/affiliate/affiliateMonthClosing.service.js');

    const result = await cronJobRunRepository.recordRun(AFFILIATE_MONTH_CLOSING_JOB_CODE, async () => {
      return closeAffiliateMonth('2026-09');
    });

    expect(result.status).toBe('noop');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('disabled');
    expect(result.insertedPeriods).toBe(0);

    // Bằng chứng cron có sống và ghi nhận vào cron_job_runs
    const { rows: runs } = await db.query(
      'SELECT * FROM cron_job_runs WHERE job_code = $1 ORDER BY id DESC LIMIT 1',
      [AFFILIATE_MONTH_CLOSING_JOB_CODE]
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('noop');
    expect(runs[0].result).toMatchObject({ skipped: true, reason: 'disabled' });

    const { rows: periods } = await db.query('SELECT * FROM affiliate_periods');
    expect(periods).toHaveLength(0);

    const { rows: ledger } = await db.query('SELECT * FROM affiliate_ledger');
    expect(ledger).toHaveLength(0);
  });

  it('f. findPurgeBlockers phát hiện hoạt động trong affiliate_periods và affiliate_ledger và chặn xoá cứng user', async () => {
    const referrer = await createUser({ email: 'ref-f@test.com', username: 'ref_f' });
    const buyer = await createUser({
      email: 'buyer-f@test.com',
      username: 'buyer_f',
      phone: '0901000007',
    });
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 2000000,
      monthKey: '2026-09',
      orderCode: 90007,
    });

    await closeAffiliateMonth('2026-09');

    // Xoá affiliate_revenue_events trước để cô lập kiểm chứng affiliate_periods và affiliate_ledger
    await db.query('DELETE FROM affiliate_revenue_events WHERE referrer_user_id = $1', [referrer.id]);

    // 1. Kiểm tra findPurgeBlockers vẫn phát hiện và chặn
    const blockers = await findPurgeBlockers(referrer.id);
    expect(blockers).toContain('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');

    // 2. Kiểm tra ràng buộc khoá ngoại ON DELETE RESTRICT chặn xoá cứng ở tầng PostgreSQL
    await expect(
      db.query('DELETE FROM users WHERE id = $1', [referrer.id])
    ).rejects.toThrow(/affiliate_(periods|ledger)/i);
  });

  it('g. Gross giảm (do buyer bị xoá mềm / mất SĐT) → đếm decreasedGrossPeriods, log cảnh báo, KHÔNG trừ tiền khách', async () => {
    const referrer = await createUser({ email: 'ref-g@test.com', username: 'ref_g' });
    const buyer = await createUser({
      email: 'buyer-g@test.com',
      username: 'buyer_g',
      phone: '0901000008',
    });
    await insertRevenueEvent({
      referrerId: referrer.id,
      buyerId: buyer.id,
      amount: 5000000,
      monthKey: '2026-09',
      orderCode: 90008,
    });

    // Đóng sổ lần 1: gross 5tr, bậc 1 (10%) -> 500.000đ
    const run1 = await closeAffiliateMonth('2026-09');
    expect(run1.status).toBe('success');
    expect(run1.insertedPeriods).toBe(1);
    expect(run1.totalCommission).toBe(500000);
    expect(await getAffiliateBalance(referrer.id)).toBe(500000);

    // Buyer bị xoá mềm hoặc gỡ SĐT (phone = NULL)
    await db.query('UPDATE users SET phone = NULL WHERE id = $1', [buyer.id]);

    // Đóng sổ lại tháng 9: gross tính theo buyer có SĐT tụt về 0 (< 5tr)
    const run2 = await closeAffiliateMonth('2026-09');
    expect(run2.status).toBe('noop');
    expect(run2.insertedPeriods).toBe(0);
    expect(run2.adjustedPeriods).toBe(0);
    expect(run2.decreasedGrossPeriods).toBe(1);

    // Số dư và bút toán trên ledger KHÔNG bị trừ
    expect(await getAffiliateBalance(referrer.id)).toBe(500000);
    const { rows: ledgerRows } = await db.query(
      'SELECT * FROM affiliate_ledger WHERE user_id = $1',
      [referrer.id]
    );
    expect(ledgerRows).toHaveLength(1);
    expect(Number(ledgerRows[0].amount)).toBe(500000);

    // affiliate_periods giữ nguyên không bị ghi đè thành 0
    const { rows: periods } = await db.query(
      'SELECT * FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2',
      [referrer.id, '2026-09']
    );
    expect(Number(periods[0].commission_amount)).toBe(500000);
    expect(Number(periods[0].gross_revenue)).toBe(5000000);
  });
});
