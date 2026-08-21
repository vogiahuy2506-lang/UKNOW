const isEnabled = () =>
  String(process.env.SIGNUP_TRIAL_ENABLED ?? 'true') !== 'false';
const trialPlanCode = () => process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';

/**
 * Phiên bản dùng trong transaction. Trả về null nếu disabled (không throw) —
 * caller có thể bỏ qua.
 *
 * Khi enabled mà lỗi, phân biệt 2 loại để quyết có ROLLBACK cả INSERT user hay không:
 *   - Lỗi hạ tầng tạm thời (mất kết nối DB, timeout — driver `pg` luôn gắn `.code`,
 *     vd '57P01', '08006', 'ECONNREFUSED') → throw để caller ROLLBACK. Đáng để thử
 *     lại toàn bộ request hơn là tạo user không có gói.
 *   - Lỗi cấu hình/business rule (gói trial bị đổi tên/ẩn/sai code, hoặc gói không
 *     miễn phí — `activateFreePlan`/`assertTrialNotRegisteredTwice` throw `Error`
 *     thường, không có `.code`) → bắt tại đây, log cảnh báo, trả về null thay vì
 *     throw. Lỗi loại này KHÔNG tự khỏi — để nó chặn toàn bộ luồng đăng ký cho tới
 *     khi có người phát hiện thì mất khách liên tục, tệ hơn nhiều so với việc tạo
 *     một user không có gói trial.
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

  try {
    // Dynamic import, không static ở đầu file: payment.service.js kéo theo cả PayOS
    // client, matbaoInvoice, einvoice... — một cây import rất nặng. auth.controller.js
    // (caller tĩnh của hàm này) sẽ kéo cả cây đó vào graph của nó nếu import tĩnh,
    // làm hỏng mock ESM của các test không hề đụng tới luồng cấp trial. Cùng lý do
    // signupTrial.service.js (bản Google login) vốn đã dùng dynamic import.
    const { activateFreePlan } = await import('../payment/payment.service.js');
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
  } catch (err) {
    if (err && err.code) throw err; // lỗi hạ tầng — để caller rollback
    console.error(`[SignupTrial] Không cấp được trial cho user ${userId} (không rollback đăng ký):`, err?.message || err);
    return null;
  }
}
