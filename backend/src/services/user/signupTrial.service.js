import db from '../../config/database.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

const trialPlanCode = () => process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';
const isEnabled = () => String(process.env.SIGNUP_TRIAL_ENABLED ?? 'true') !== 'false';

/**
 * Cấp gói dùng thử cho tài khoản vừa tạo (dùng cho Google login — fail-mềm).
 * KHÔNG BAO GIỜ throw: đăng ký hỏng vì thiếu gói trial là mất khách, sai hơn nhiều
 * so với user login thành công nhưng active_plan_id = NULL.
 *
 * Lỗi được ghi vào system_audit_log (action = USER_PLAN_CHANGE_FAILED) để có dấu vết
 * server-side khi dev cần điều tra tại sao user Google không nhận được trial.
 *
 * @param {{ userId: number, userEmail: string, req?: import('express').Request }} params
 * @returns {Promise<null | { activePlanId: number, planCode: string, planName: string, durationDays: number, expiresAt: string }>}
 */
export async function grantSignupTrial({ userId, userEmail, req = null }) {
  if (!isEnabled() || !userId || !userEmail) return null;
  try {
    const { activateFreePlan } = await import('../payment/payment.service.js');
    await activateFreePlan({
      planCode: trialPlanCode(),
      userId,
      userEmail,
      billingPeriod: 'monthly',
    });

    const { rows } = await db.query(
      `SELECT u.active_plan_id, u.subscription_expires_at,
              p.code, p.name, p.duration_days,
              p.messages_per_period, p.ai_credits_per_period, p.max_chatbots
       FROM users u JOIN plans p ON p.id = u.active_plan_id
       WHERE u.id = $1`,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      activePlanId: row.active_plan_id,
      planCode: row.code,
      planName: row.name,
      durationDays: row.duration_days,
      messagesPerPeriod: row.messages_per_period,
      aiCreditsPerPeriod: row.ai_credits_per_period,
      maxChatbots: row.max_chatbots,
      expiresAt: row.subscription_expires_at,
    };
  } catch (err) {
    console.error('[SignupTrial] grant failed:', err?.message || err);
    try {
      const ctx = req ? getSystemAuditContext(req) : { userId, ownerId: null, ipAddress: null, userAgent: null };
      await logSystem(ctx, AUDIT_ACTIONS.USER_PLAN_CHANGE_FAILED, AUDIT_ENTITY_TYPES.USER, userId, {
        source: 'signup_auto_trial_google',
        planCode: trialPlanCode(),
        error: err?.message || String(err),
      });
    } catch (auditErr) {
      console.error('[SignupTrial] audit log failed:', auditErr?.message || auditErr);
    }
    return null;
  }
}
