import { activateFreePlan } from '../payment/payment.service.js';

const isEnabled = () =>
  String(process.env.SIGNUP_TRIAL_ENABLED ?? 'true') !== 'false';
const trialPlanCode = () => process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';

/**
 * Phiên bản dùng trong transaction: throw nếu thất bại để caller rollback toàn bộ.
 * Trả về null nếu disabled (không throw) — caller có thể bỏ qua.
 * Nếu enabled mà lỗi → throw để caller (auth.controller.register) ROLLBACK cả INSERT user.
 *
 * @param {import('pg').PoolClient} client — pg client với transaction đã BEGIN
 * @param {{ userId: number, userEmail: string }} params
 * @returns {Promise<null | {
 *   activePlanId: number,
 *   planCode: string,
 *   planName: string,
 *   durationDays: number,
 *   messagesPerPeriod: number,
 *   aiCreditsPerPeriod: number,
 *   maxChatbots: number,
 *   expiresAt: string,
 * }>}
 */
export async function grantSignupTrialInTx(client, { userId, userEmail }) {
  if (!isEnabled()) return null;
  if (!userId || !userEmail) {
    throw new Error('grantSignupTrialInTx: missing userId/userEmail');
  }

  await activateFreePlan({
    planCode: trialPlanCode(),
    userId,
    userEmail,
    billingPeriod: 'monthly',
    queryable: client,
  });

  const { rows: planRows } = await client.query(
    `SELECT u.active_plan_id, u.subscription_expires_at,
            p.code, p.name, p.duration_days,
            p.messages_per_period, p.ai_credits_per_period, p.max_chatbots
       FROM users u JOIN plans p ON p.id = u.active_plan_id
       WHERE u.id = $1`,
    [userId]
  );
  const row = planRows[0];
  if (!row) {
    throw new Error('grantSignupTrialInTx: plan not applied after activateFreePlan');
  }
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
}
