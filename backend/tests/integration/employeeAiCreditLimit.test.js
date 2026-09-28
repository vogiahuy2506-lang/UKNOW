/**
 * Hạn mức credit AI theo nhân viên (user_members.daily_ai_credit_limit / period_ai_credit_limit) — chạy SQL THẬT.
 *
 * Vì sao cần file này: aiCreditMeter.service.spec.js mock trọn database.js, nên câu SQL đếm lượt của nhân viên
 * từng đọc cột `usage_logs.quantity` (không tồn tại — cột đúng là `delta`) mà unit vẫn xanh; trên production mọi
 * nhân viên được đặt hạn mức đều bị chặn AI 100% với lỗi Postgres thô
 * (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 2). Ca ở đây chỉ xanh khi câu SQL đúng tên cột VÀ đếm đúng người.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

async function setupWorkspace({ dailyLimit = null, periodLimit = null } = {}) {
  const plan = await createPlan({ maxEmployees: 5, aiCreditsPerPeriod: 100 });
  const owner = await createUser({ username: `owner${Date.now()}`, role: 'user', planId: plan.id });
  await assignPlanToUser(owner.id, plan.id);
  const staff = await createUser({ username: `staff${Date.now()}`, withPlan: false });
  const other = await createUser({ username: `other${Date.now()}`, withPlan: false });
  for (const emp of [staff, other]) {
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, daily_ai_credit_limit, period_ai_credit_limit)
       VALUES ($1, $2, '{"ai_assistant_use": true}'::jsonb, 'active', 'created', $3, $4)`,
      [owner.id, emp.id, dailyLimit, periodLimit]
    );
  }
  return { owner, staff, other };
}

/** Trừ 1 credit đúng như handler thật: assertAvailable (tiền kiểm) rồi consume (ghi usage_logs). */
async function spendOne(userId, ownerId) {
  const ctx = await aiCreditMeter.assertAvailable(userId, { ownerContextId: ownerId });
  await aiCreditMeter.consume(userId, { feature: 'test', creditContext: ctx });
}

describe('Hạn mức credit AI theo nhân viên — SQL thật trên usage_logs', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('không đặt hạn mức → nhân viên dùng được (đối chứng)', async () => {
    const { owner, staff } = await setupWorkspace();
    await expect(aiCreditMeter.assertAvailable(staff.id, { ownerContextId: owner.id })).resolves.toMatchObject({ skip: false });
  });

  it('hạn mức ngày = 2: dùng 2 lượt được, lượt thứ 3 bị chặn EMPLOYEE_AI_LIMIT_EXCEEDED (2/2)', async () => {
    const { owner, staff } = await setupWorkspace({ dailyLimit: 2 });

    await spendOne(staff.id, owner.id);
    await spendOne(staff.id, owner.id);

    // usage_logs ghi đúng: tính vào ví của chủ, người thao tác là nhân viên
    const { rows } = await db.query(
      `SELECT id_user, actor_user_id, delta FROM usage_logs WHERE resource_type = 'ai_credit' ORDER BY id`
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => Number(r.id_user) === Number(owner.id) && Number(r.actor_user_id) === Number(staff.id) && r.delta === 1)).toBe(true);

    let err = null;
    try {
      await aiCreditMeter.assertAvailable(staff.id, { ownerContextId: owner.id });
    } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(err.code).toBe('EMPLOYEE_AI_LIMIT_EXCEEDED');
    expect(err.status).toBe(403);
    expect(err.used).toBe(2);
    expect(err.limit).toBe(2);
  });

  it('đếm theo NGƯỜI thao tác: nhân viên A dùng hết không làm nhân viên B (cùng chủ, cùng hạn mức) bị chặn', async () => {
    const { owner, staff, other } = await setupWorkspace({ dailyLimit: 1 });
    await spendOne(staff.id, owner.id);

    await expect(aiCreditMeter.assertAvailable(staff.id, { ownerContextId: owner.id }))
      .rejects.toMatchObject({ code: 'EMPLOYEE_AI_LIMIT_EXCEEDED' });
    await expect(aiCreditMeter.assertAvailable(other.id, { ownerContextId: owner.id }))
      .resolves.toMatchObject({ skip: false });
  });

  it('hạn mức ngày không chặn lượt của CHỦ (self context) dù cùng ví', async () => {
    const { owner, staff } = await setupWorkspace({ dailyLimit: 1 });
    await spendOne(staff.id, owner.id);
    // Chủ tự dùng: không có ownerContextId → không rơi vào nhánh hạn mức nhân viên
    await expect(aiCreditMeter.assertAvailable(owner.id)).resolves.toMatchObject({ skip: false });
  });

  it('hạn mức kỳ = 1: lượt đầu được, lượt sau bị chặn với câu báo "trong kỳ (1/1)"', async () => {
    // getBillingCycle vẫn dựng được chu kỳ cho gói không có đơn (mốc kích hoạt), nên nhánh kỳ chạy thật ở đây —
    // câu SQL kỳ cũng từng đọc cột `quantity`.
    const { owner, staff } = await setupWorkspace({ periodLimit: 1 });
    await spendOne(staff.id, owner.id);

    let err = null;
    try {
      await aiCreditMeter.assertAvailable(staff.id, { ownerContextId: owner.id });
    } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(err.code).toBe('EMPLOYEE_AI_LIMIT_EXCEEDED');
    expect(err.message).toContain('trong kỳ (1/1)');
  });
});
