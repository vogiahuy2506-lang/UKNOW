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

/**
 * Pre-flight only: verify credit available before handler (no charge).
 * Handler must call chargeAiCredit(req) after successful AI output.
 *
 * @param {string} feature
 */
export function assertAiCreditAvailable(feature) {
  return async (req, res, next) => {
    try {
      req.aiCreditFeature = feature;
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
