import aiCreditMeter from '../services/ai/aiCreditMeter.service.js';

function buildCreditErrorPayload(error) {
  return {
    success: false,
    message: error.message || 'Đã hết lượt AI trong kỳ',
    ...(error.code ? { code: error.code } : {}),
    ...(error.resource ? { resource: error.resource } : {}),
    ...(error.used !== undefined ? { used: error.used } : {}),
    ...(error.limit !== undefined ? { limit: error.limit } : {}),
    ...(error.upgradeRequired ? { upgradeRequired: true } : {}),
  };
}

/** Feature DUY NHẤT có lượt miễn credit (sửa hiển thị tự động của landing) — xem chú thích bên dưới. */
export const AUTO_LAYOUT_FIX_CREDIT_FREE_FEATURE = 'ai_edit_landing_html';

/**
 * Pre-flight only: verify credit available before handler (no charge).
 * Handler must call chargeAiCredit(req) after successful AI output.
 *
 * Lượt sửa TỰ ĐỘNG do lỗi hiển thị của hệ thống (`body.autoLayoutFix === true`, plan landing tự
 * kiểm mục 10.2) KHÔNG kiểm và KHÔNG trừ credit — khách hết credit vẫn được sửa lỗi của hệ thống.
 * Chống lợi dụng nằm ở handler: trần 2 lượt/tin đếm ở server, lệnh sửa do server dựng, tin phải
 * thuộc phiên của chính user. Token model vẫn ghi qua aiUsageMeter.
 *
 * CHỈ feature sửa landing mới được miễn. Middleware này dùng chung cho 11 route tính credit
 * (chat, sinh chiến dịch, sinh landing, tóm tắt hộp thư, dashboard…): bản đầu (review 21/09) miễn cho
 * MỌI feature hễ body có `autoLayoutFix: true`, và chargeAiCredit cũng bỏ trừ theo cùng cờ → ai gửi
 * thêm một trường vào `/ai/chat` là dùng AI miễn phí không giới hạn. Các handler khác không biết gì
 * về cờ này nên không có trần nào đỡ — khoá phải nằm ở đây.
 *
 * @param {string} feature
 */
export function assertAiCreditAvailable(feature) {
  return async (req, res, next) => {
    try {
      req.aiCreditFeature = feature;
      if (feature === AUTO_LAYOUT_FIX_CREDIT_FREE_FEATURE && req.body?.autoLayoutFix === true) {
        req.aiCreditSkipped = true;
        return next();
      }
      const forceBillable = Boolean(req.body?.forceBillable);
      req.aiCreditForceBillable = forceBillable;
      const ownerContextId = req.user?.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : null;
      req.aiCreditContext = await aiCreditMeter.assertAvailable(req.user?.id, {
        ownerContextId,
        forceBillable,
      });
      next();
    } catch (error) {
      const status = error.status || (error.code === 'RESOURCE_LIMIT_EXCEEDED' ? 402 : 403);
      return res.status(status).json(buildCreditErrorPayload(error));
    }
  };
}

/**
 * Charge 1 credit after successful AI (attach to req via assertAiCreditAvailable).
 *
 * @param {import('express').Request} req
 */
export async function chargeAiCredit(req) {
  if (req.aiCreditSkipped) return; // lượt tự sửa của hệ thống — không bao giờ trừ credit
  if (!req.user?.id || !req.aiCreditFeature) return;
  await aiCreditMeter.consume(req.user.id, {
    feature: req.aiCreditFeature,
    creditContext: req.aiCreditContext,
    forceBillable: Boolean(req.aiCreditForceBillable),
  });
}

/** @deprecated Use assertAiCreditAvailable + chargeAiCredit */
export const requireAiCredit = assertAiCreditAvailable;

export { buildCreditErrorPayload };
