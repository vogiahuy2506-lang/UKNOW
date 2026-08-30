const isEnabled = () =>
  String(process.env.SIGNUP_TRIAL_ENABLED ?? 'true') !== 'false';
const trialPlanCode = () => process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';

/**
 * Mã lỗi THẬT SỰ tạm thời — đáng để rollback cả đăng ký và để client thử lại.
 * KHÔNG dùng "có .code hay không" làm tiêu chí (đã thử và sai): Postgres gắn
 * .code cho cả lỗi vĩnh viễn (23505 trùng khoá, 23503 khoá ngoại, 23514 check),
 * và Node gắn .code cho lỗi tại chỗ như ERR_MODULE_NOT_FOUND — dynamic import
 * ngay trong hàm dưới đây bị lỗi (path sai, file bị xoá nhầm lúc deploy...) CŨNG
 * có .code, nếu coi là "tạm thời" thì mọi lượt đăng ký sau đó rollback vĩnh viễn —
 * đúng kịch bản mà nhánh fail-mềm này sinh ra để tránh.
 */
const TRANSIENT_ERROR_CODES = new Set([
  // Postgres — connection exception (class 08)
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  // Postgres — server đang tắt / câu lệnh bị huỷ do timeout
  '57P01', '57P02', '57P03', '57014',
  // Node/network layer
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE',
]);

function isTransientInfraError(err) {
  return Boolean(err?.code && TRANSIENT_ERROR_CODES.has(err.code));
}

/**
 * Phiên bản dùng trong transaction. Trả về null nếu disabled (không throw) —
 * caller có thể bỏ qua.
 *
 * Khi enabled mà lỗi, phân biệt 2 loại để quyết có ROLLBACK cả INSERT user hay không:
 *   - Lỗi hạ tầng tạm thời (đúng whitelist TRANSIENT_ERROR_CODES ở trên) → throw
 *     để caller ROLLBACK. Đáng để thử lại toàn bộ request hơn là tạo user không có gói.
 *   - MỌI lỗi khác (cấu hình, business rule, ràng buộc DB vĩnh viễn, lỗi triển khai)
 *     → bắt tại đây, log cảnh báo, trả về null thay vì throw. Lỗi loại này KHÔNG tự
 *     khỏi — để nó chặn toàn bộ luồng đăng ký cho tới khi có người phát hiện thì mất
 *     khách liên tục, tệ hơn nhiều so với việc tạo một user không có gói trial.
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

  // This service is intentionally fail-soft for a trial configuration error:
  // the account registration may still commit.  Isolate the trial writes in a
  // savepoint so a failure after creating the free order cannot commit that
  // `success` order without its entitlement.
  const savepoint = 'signup_trial_activation';
  let savepointCreated = false;

  try {
    await client.query(`SAVEPOINT ${savepoint}`);
    savepointCreated = true;

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
    const result = {
      activePlanId: row.active_plan_id,
      planCode: row.code,
      planName: row.name,
      durationDays: row.duration_days,
      messagesPerPeriod: row.messages_per_period,
      aiCreditsPerPeriod: row.ai_credits_per_period,
      maxChatbots: row.max_chatbots,
      expiresAt: row.subscription_expires_at,
    };
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    savepointCreated = false;
    return result;
  } catch (err) {
    // Không tạo được SAVEPOINT thì không có ranh giới nào để cô lập trial
    // writes. Có thể outer transaction đã bị abort (25P02), nên tuyệt đối
    // không được fail-soft rồi để caller COMMIT transaction không còn hợp lệ.
    if (!savepointCreated) {
      throw err;
    }

    if (savepointCreated) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointErr) {
        // If savepoint recovery fails, the outer transaction is no longer known
        // to be usable. Do not swallow it: the caller must roll back the whole
        // signup instead of attempting to commit a poisoned transaction.
        console.error(`[SignupTrial] Không rollback được savepoint cho user ${userId}:`, savepointErr?.message || savepointErr);
        const recoveryError = new Error(
          `Không thể khôi phục transaction cấp trial cho user ${userId}; cần rollback toàn bộ đăng ký`,
          { cause: err }
        );
        recoveryError.savepointError = savepointErr;
        throw recoveryError;
      }
    }
    if (isTransientInfraError(err)) throw err; // lỗi hạ tầng thật sự — để caller rollback
    console.error(`[SignupTrial] Không cấp được trial cho user ${userId} (không rollback đăng ký):`, err?.message || err);
    return null;
  }
}
