/**
 * Integration tests cho Affiliate PR-A2: Ghi doanh thu quy gán (Affiliate Revenue Sweep).
 *
 * Kiểm tra đầy đủ:
 * 1. Đơn PayOS thành công (có paid_at timestamptz) → sweep ghi nhận event với month_key chuẩn theo giờ VN.
 * 2. Đơn manual thành công (paid_at NULL, updated_at TIMESTAMP naive) → sweep ghi nhận event với month_key chuẩn.
 * 3. Đơn cuối tháng 23:30 ngày 30/09 giờ VN → month_key = '2026-09'.
 * 4. Idempotency: chạy lại sweep nhiều lần không nhân đôi doanh thu (UNIQUE order_id).
 * 5. Loại trừ:
 *    - payment_method = 'free' hoặc amount <= 0 → không sinh event.
 *    - buyer tự giới thiệu chính mình (referred_by_user_id == buyer_id) → không sinh event.
 *    - buyer không có người giới thiệu (referred_by_user_id IS NULL) → không sinh event.
 *    - status khác 'success' (pending, failed, cancelled) → không sinh event.
 * 6. Buyer chưa có SĐT: VẪN ghi nhận event (chỉ hoãn tính lúc đóng sổ PR-A3).
 * 7. Bảo vệ khỏi xoá cứng:
 *    - findPurgeBlockers phát hiện hoạt động affiliate của cả referrer lẫn buyer.
 *    - Ràng buộc ON DELETE RESTRICT chặn DELETE cứng user cha (PostgreSQL 23503).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, createOrder } from './helpers/db.js';
import { sweepAffiliateRevenue } from '../../src/services/affiliate/affiliateRevenueSweep.service.js';
import { findPurgeBlockers } from '../../src/repositories/admin/adminMembers.repository.js';

beforeEach(async () => {
  await truncateAll();
});

describe('Affiliate PR-A2 — Ghi doanh thu quy gán (Revenue Sweep)', () => {
  it('quét đơn PayOS thành công có paid_at → ghi nhận event đúng month_key theo giờ VN', async () => {
    const referrer = await createUser({ email: 'ref1@test.com', username: 'ref1' });
    const buyer = await createUser({
      email: 'buyer1@test.com',
      username: 'buyer1',
      phone: '0901000001',
    });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyer.id]);

    const plan = await createPlan({ name: 'Pro Plan', price: 500000 });
    const order = await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 500000,
      status: 'success',
      paymentMethod: 'payos',
    });

    // Đơn thanh toán lúc 14:00 ngày 15/09/2026 giờ VN
    await db.query(
      "UPDATE orders SET paid_at = '2026-09-15 14:00:00+07' WHERE id = $1",
      [order.id]
    );

    const result = await sweepAffiliateRevenue();
    expect(result.status).toBe('success');
    expect(result.inserted).toBe(1);

    const { rows: events } = await db.query(
      'SELECT * FROM affiliate_revenue_events WHERE order_id = $1',
      [order.id]
    );
    expect(events).toHaveLength(1);
    expect(events[0].referrer_user_id).toBe(String(referrer.id));
    expect(events[0].buyer_user_id).toBe(String(buyer.id));
    expect(events[0].order_id).toBe(order.id);
    expect(Number(events[0].amount)).toBe(500000);
    expect(events[0].month_key).toBe('2026-09');
  });

  it('quét đơn manual thành công (paid_at NULL, dùng updated_at) → ghi nhận event đúng month_key', async () => {
    const referrer = await createUser({ email: 'ref2@test.com', username: 'ref2' });
    const buyer = await createUser({
      email: 'buyer2@test.com',
      username: 'buyer2',
      phone: '0901000002',
    });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyer.id]);

    const plan = await createPlan({ name: 'Enterprise Plan', price: 2000000 });
    const order = await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 2000000,
      status: 'success',
      paymentMethod: 'manual',
    });

    // Đơn manual paid_at là NULL, updated_at dạng TIMESTAMP naive giờ VN
    await db.query(
      "UPDATE orders SET paid_at = NULL, updated_at = '2026-10-05 09:30:00' WHERE id = $1",
      [order.id]
    );

    const result = await sweepAffiliateRevenue();
    expect(result.status).toBe('success');
    expect(result.inserted).toBe(1);

    const { rows: events } = await db.query(
      'SELECT * FROM affiliate_revenue_events WHERE order_id = $1',
      [order.id]
    );
    expect(events).toHaveLength(1);
    expect(events[0].month_key).toBe('2026-10');
    expect(Number(events[0].amount)).toBe(2000000);
  });

  it('xử lý mốc biên cuối tháng: đơn lúc 23:30 ngày 30/09 giờ VN phải ra month_key 2026-09', async () => {
    const referrer = await createUser({ email: 'ref3@test.com', username: 'ref3' });
    const buyerPayos = await createUser({ email: 'buyer3a@test.com', username: 'buyer3a', phone: '0901000003' });
    const buyerManual = await createUser({ email: 'buyer3b@test.com', username: 'buyer3b', phone: '0901000004' });

    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id IN ($2, $3)', [
      referrer.id,
      buyerPayos.id,
      buyerManual.id,
    ]);

    const plan = await createPlan({ name: 'Plan Edge', price: 1000000 });

    // 1. Đơn PayOS lúc 23:30 ngày 30/09 giờ VN (= 16:30 UTC)
    const orderPayos = await createOrder({
      planId: plan.id,
      userId: buyerPayos.id,
      userEmail: buyerPayos.email,
      amount: 1000000,
      status: 'success',
      paymentMethod: 'payos',
    });
    await db.query(
      "UPDATE orders SET paid_at = '2026-09-30 23:30:00+07' WHERE id = $1",
      [orderPayos.id]
    );

    // 2. Đơn Manual lúc 23:30 ngày 30/09 giờ VN (naive)
    const orderManual = await createOrder({
      planId: plan.id,
      userId: buyerManual.id,
      userEmail: buyerManual.email,
      amount: 1000000,
      status: 'success',
      paymentMethod: 'manual',
    });
    await db.query(
      "UPDATE orders SET paid_at = NULL, updated_at = '2026-09-30 23:30:00' WHERE id = $1",
      [orderManual.id]
    );

    await sweepAffiliateRevenue();

    const { rows: events } = await db.query(
      'SELECT order_id, month_key FROM affiliate_revenue_events WHERE order_id IN ($1, $2) ORDER BY order_id',
      [orderPayos.id, orderManual.id]
    );
    expect(events).toHaveLength(2);
    expect(events[0].month_key).toBe('2026-09');
    expect(events[1].month_key).toBe('2026-09');
  });

  it('idempotency: chạy lại sweep nhiều lần không nhân đôi doanh thu', async () => {
    const referrer = await createUser({ email: 'ref4@test.com', username: 'ref4' });
    const buyer = await createUser({ email: 'buyer4@test.com', username: 'buyer4', phone: '0901000005' });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyer.id]);

    const plan = await createPlan({ name: 'Plan Idempotent', price: 300000 });
    const order = await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 300000,
      status: 'success',
    });

    // Lần sweep thứ nhất
    const run1 = await sweepAffiliateRevenue();
    expect(run1.inserted).toBe(1);

    // Lần sweep thứ hai
    const run2 = await sweepAffiliateRevenue();
    expect(run2.inserted).toBe(0);
    expect(run2.status).toBe('noop');

    const { rows: events } = await db.query(
      'SELECT * FROM affiliate_revenue_events WHERE order_id = $1',
      [order.id]
    );
    expect(events).toHaveLength(1);
  });

  it('loại trừ các trường hợp không đủ điều kiện: free, amount <= 0, pending, tự giới thiệu, không người giới thiệu', async () => {
    const referrer = await createUser({ email: 'ref5@test.com', username: 'ref5' });
    const buyer = await createUser({ email: 'buyer5@test.com', username: 'buyer5', phone: '0901000006' });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyer.id]);

    const plan = await createPlan({ name: 'Test Plan', price: 100000 });

    // 1. payment_method = 'free'
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 0,
      status: 'success',
      paymentMethod: 'free',
    });

    // 2. amount <= 0 (voucher 100%)
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 0,
      status: 'success',
      paymentMethod: 'voucher',
    });

    // 3. status = 'pending'
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 100000,
      status: 'pending',
    });

    // 4. status = 'failed'
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 100000,
      status: 'failed',
    });

    // 5. Tự giới thiệu chính mình
    const selfReferred = await createUser({ email: 'self@test.com', username: 'self', phone: '0901000007' });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $1', [selfReferred.id]);
    await createOrder({
      planId: plan.id,
      userId: selfReferred.id,
      userEmail: selfReferred.email,
      amount: 100000,
      status: 'success',
    });

    // 6. User không có người giới thiệu (referred_by_user_id IS NULL)
    const unreferred = await createUser({ email: 'unref@test.com', username: 'unref', phone: '0901000008' });
    await createOrder({
      planId: plan.id,
      userId: unreferred.id,
      userEmail: unreferred.email,
      amount: 100000,
      status: 'success',
    });

    const result = await sweepAffiliateRevenue();
    expect(result.inserted).toBe(0);

    const { rows: events } = await db.query('SELECT * FROM affiliate_revenue_events');
    expect(events).toHaveLength(0);
  });

  it('người mua chưa có SĐT: VẪN ghi nhận event (hoãn xét điều kiện đến lúc đóng sổ PR-A3)', async () => {
    const referrer = await createUser({ email: 'ref6@test.com', username: 'ref6' });
    // Buyer đăng ký bằng Google chưa có SĐT (phone = null)
    const buyerNoPhone = await createUser({
      email: 'nophone@test.com',
      username: 'nophone',
      phone: null,
    });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyerNoPhone.id]);

    const plan = await createPlan({ name: 'Plan No Phone', price: 700000 });
    const order = await createOrder({
      planId: plan.id,
      userId: buyerNoPhone.id,
      userEmail: buyerNoPhone.email,
      amount: 700000,
      status: 'success',
      paymentMethod: 'payos',
    });

    const result = await sweepAffiliateRevenue();
    expect(result.inserted).toBe(1);

    const { rows: events } = await db.query(
      'SELECT * FROM affiliate_revenue_events WHERE order_id = $1',
      [order.id]
    );
    expect(events).toHaveLength(1);
    expect(events[0].buyer_user_id).toBe(String(buyerNoPhone.id));
    expect(Number(events[0].amount)).toBe(700000);
  });

  it('findPurgeBlockers phát hiện hoạt động affiliate và chặn xoá cứng user', async () => {
    const referrer = await createUser({ email: 'ref7@test.com', username: 'ref7' });
    const buyer = await createUser({ email: 'buyer7@test.com', username: 'buyer7', phone: '0901000009' });
    await db.query('UPDATE users SET referred_by_user_id = $1 WHERE id = $2', [referrer.id, buyer.id]);

    const plan = await createPlan({ name: 'Plan Purge Test', price: 400000 });
    await createOrder({
      planId: plan.id,
      userId: buyer.id,
      userEmail: buyer.email,
      amount: 400000,
      status: 'success',
    });

    await sweepAffiliateRevenue();

    // Referrer chưa từng tự mua đơn nào nhưng có doanh thu affiliate quy gán
    const referrerBlockers = await findPurgeBlockers(referrer.id);
    expect(referrerBlockers).toContain('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');

    // Buyer có hoạt động affiliate
    const buyerBlockers = await findPurgeBlockers(buyer.id);
    expect(buyerBlockers).toContain('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');

    // Ràng buộc ON DELETE RESTRICT: xoá cứng user cha bị ném lỗi 23503 từ Postgres
    await expect(db.query('DELETE FROM users WHERE id = $1', [referrer.id])).rejects.toThrow(
      /affiliate_revenue_events_referrer_user_id_fkey/i
    );
  });
});
