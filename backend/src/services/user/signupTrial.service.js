import db from '../../config/database.js';

const trialPlanCode = () => process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';
const isEnabled = () => String(process.env.SIGNUP_TRIAL_ENABLED ?? 'true') !== 'false';

/**
 * Cấp gói dùng thử cho tài khoản vừa tạo. KHÔNG BAO GIỜ throw:
 * đăng ký hỏng vì thiếu gói trial là mất khách, sai hơn nhiều so với không có trial.
 * @returns {Promise<null | { activePlanId: number, planCode: string, planName: string, durationDays: number, expiresAt: string }>}
 */
export async function grantSignupTrial({ userId, userEmail }) {
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
    return null;
  }
}
