/**
 * Integration tests cho `subscription.repository.js`.
 *
 * Khác với HTTP test, các test ở đây gọi trực tiếp function repository
 * và kiểm tra SQL date logic (gia hạn cộng dồn, lọc theo khoảng ngày,
 * điều kiện reminder_count). Chạy trên DB thật để verify đúng cú pháp
 * INTERVAL/CASE của PostgreSQL.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import {
  findExpiringUsers,
  findExpiredUsers,
  expireUserPlan,
  incrementReminderCount,
  assignPlanWithExpiry,
  isReturningCustomer,
} from '../../src/repositories/subscription/subscription.repository.js';
import db from '../../src/config/database.js';
import {
  truncateAll,
  createUser,
  createPlan,
  createOrder,
} from './helpers/db.js';

beforeAll(() => {
  // Repository không cần app — chỉ cần DB pool sẵn sàng.
});

beforeEach(async () => {
  await truncateAll();
});

/**
 * Helper: gán plan + set expires_at + reminder_count cho user.
 * Bypass logic gia hạn của repository để arrange test state chính xác.
 */
async function setSubscription(userId, planId, expiresAt, reminderCount = 0) {
  await db.query(
    `UPDATE users
     SET active_plan_id = $1,
         subscription_expires_at = $2,
         subscription_reminder_count = $3
     WHERE id = $4`,
    [planId, expiresAt, reminderCount, userId]
  );
}

// ===========================================================================
// findExpiringUsers
// ===========================================================================
describe('findExpiringUsers(minDays, maxDays, reminderThreshold)', () => {
  it('chỉ trả user role=user, status=active, có plan, expires trong [minDays, maxDays]', async () => {
    const plan = await createPlan({ code: 'p1' });
    const u1 = await createUser({ username: 'in-range' });
    const u2 = await createUser({ username: 'too-far' });
    const u3 = await createUser({ username: 'expired-already' });
    const u4 = await createUser({ username: 'inactive', status: 'inactive' });

    const days = (n) => new Date(Date.now() + n * 86400000);
    await setSubscription(u1.id, plan.id, days(5));   // ✓ trong [3, 7]
    await setSubscription(u2.id, plan.id, days(30));  // ngoài range
    await setSubscription(u3.id, plan.id, days(-1));  // đã hết hạn
    await setSubscription(u4.id, plan.id, days(5));   // inactive

    const rows = await findExpiringUsers(3, 7, 3);
    const usernames = rows.map((r) => r.full_name);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(u1.id);
    expect(usernames).not.toContain('too-far');
    expect(usernames).not.toContain('expired-already');
  });

  it('exclude user đã đạt reminderThreshold (đã được nhắc đủ số lần)', async () => {
    const plan = await createPlan({ code: 'p2' });
    const userMaxed = await createUser({ username: 'reminded3' });
    const userPartial = await createUser({ username: 'reminded1' });

    const inWindow = new Date(Date.now() + 5 * 86400000);
    await setSubscription(userMaxed.id, plan.id, inWindow, 3);
    await setSubscription(userPartial.id, plan.id, inWindow, 1);

    const rows = await findExpiringUsers(3, 7, 3);
    const ids = rows.map((r) => Number(r.id));
    expect(ids).toContain(Number(userPartial.id));
    expect(ids).not.toContain(Number(userMaxed.id));
  });

  it('không match user role=admin (super admin) dù đang có expires_at', async () => {
    const plan = await createPlan({ code: 'p3' });
    const admin = await createUser({ username: 'super', role: 'admin' });
    await setSubscription(admin.id, plan.id, new Date(Date.now() + 5 * 86400000), 0);

    const rows = await findExpiringUsers(3, 7, 3);
    expect(rows).toHaveLength(0);
  });
});

// ===========================================================================
// findExpiredUsers
// ===========================================================================
describe('findExpiredUsers()', () => {
  it('chỉ trả user có expires_at < NOW và có plan đang hoạt động', async () => {
    const plan = await createPlan({ code: 'expp' });
    const expired = await createUser({ username: 'exp' });
    const future = await createUser({ username: 'still-ok' });

    await setSubscription(expired.id, plan.id, new Date(Date.now() - 86400000));
    await setSubscription(future.id, plan.id, new Date(Date.now() + 86400000));

    const rows = await findExpiredUsers();
    const ids = rows.map((r) => Number(r.id));
    expect(ids).toContain(Number(expired.id));
    expect(ids).not.toContain(Number(future.id));
  });
});

// ===========================================================================
// expireUserPlan
// ===========================================================================
describe('expireUserPlan(userId)', () => {
  it('set active_plan_id = NULL + reset reminder_count, GIỮ NGUYÊN expires_at', async () => {
    const plan = await createPlan({ code: 'gone' });
    const user = await createUser({ username: 'expirable' });
    const expiresAt = new Date(Date.now() - 86400000);
    await setSubscription(user.id, plan.id, expiresAt, 3);

    await expireUserPlan(user.id);

    const u = await db.query(
      `SELECT active_plan_id, subscription_expires_at, subscription_reminder_count
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(u.rows[0].active_plan_id).toBeNull();
    expect(u.rows[0].subscription_reminder_count).toBe(0);
    // expires_at vẫn còn (để biết là khách cũ, không reset về NULL)
    expect(u.rows[0].subscription_expires_at).not.toBeNull();
  });
});

// ===========================================================================
// incrementReminderCount
// ===========================================================================
describe('incrementReminderCount(userId)', () => {
  it('tăng reminder_count thêm 1', async () => {
    const user = await createUser({ username: 'rmnd' });
    await db.query(`UPDATE users SET subscription_reminder_count = 1 WHERE id = $1`, [user.id]);

    await incrementReminderCount(user.id);

    const u = await db.query(
      `SELECT subscription_reminder_count FROM users WHERE id = $1`,
      [user.id]
    );
    expect(u.rows[0].subscription_reminder_count).toBe(2);
  });
});

// ===========================================================================
// assignPlanWithExpiry
// ===========================================================================
describe('assignPlanWithExpiry(userId, planId)', () => {
  it('user chưa có expires_at → expires = NOW + 1 month', async () => {
    const plan = await createPlan({ code: 'fresh' });
    const user = await createUser({ username: 'fresh-buyer' });

    const result = await assignPlanWithExpiry(user.id, plan.id);
    expect(Number(result.active_plan_id)).toBe(Number(plan.id));

    const ms = new Date(result.subscription_expires_at).getTime();
    const days = (ms - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(33);
  });

  it('user có expires_at còn hạn → gia hạn += 1 month (renewal)', async () => {
    const plan = await createPlan({ code: 'renew' });
    const user = await createUser({ username: 'renew-buyer' });
    const future = new Date(Date.now() + 15 * 86400000);
    await setSubscription(user.id, plan.id, future, 2);

    const result = await assignPlanWithExpiry(user.id, plan.id);

    const newExpires = new Date(result.subscription_expires_at).getTime();
    const extraDays = (newExpires - future.getTime()) / 86400000;
    expect(extraDays).toBeGreaterThan(27);
    expect(extraDays).toBeLessThan(33);
  });

  it('user có expires_at đã hết hạn → tính lại từ NOW + 1 month (không cộng vào quá khứ)', async () => {
    const plan = await createPlan({ code: 're-old' });
    const user = await createUser({ username: 'old-customer' });
    const past = new Date(Date.now() - 30 * 86400000);
    await setSubscription(user.id, plan.id, past, 3);

    const result = await assignPlanWithExpiry(user.id, plan.id);
    const days = (new Date(result.subscription_expires_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(33);
  });

  it('reset reminder_count về 0 sau khi gia hạn', async () => {
    const plan = await createPlan({ code: 'cnt' });
    const user = await createUser({ username: 'cnt-user' });
    await db.query(
      `UPDATE users SET subscription_reminder_count = 2 WHERE id = $1`,
      [user.id]
    );

    await assignPlanWithExpiry(user.id, plan.id);

    const u = await db.query(
      `SELECT subscription_reminder_count FROM users WHERE id = $1`,
      [user.id]
    );
    expect(u.rows[0].subscription_reminder_count).toBe(0);
  });

  it('user không tồn tại → trả null', async () => {
    const plan = await createPlan({ code: 'ghost' });
    const result = await assignPlanWithExpiry(999999, plan.id);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// isReturningCustomer
// ===========================================================================
describe('isReturningCustomer(userId)', () => {
  it('user có order → true', async () => {
    const plan = await createPlan({ code: 'ret' });
    const user = await createUser({ username: 'returning' });
    await createOrder({ planId: plan.id, userId: user.id, userEmail: user.email });

    const result = await isReturningCustomer(user.id);
    expect(result).toBe(true);
  });

  it('user chưa có order → false', async () => {
    const user = await createUser({ username: 'newbie' });
    const result = await isReturningCustomer(user.id);
    expect(result).toBe(false);
  });
});
