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
      req.aiCreditContext = await aiCreditMeter.assertAvailable(req.user?.id);
      next();
    } catch (error) {
      return res.status(error.status || 403).json(buildCreditErrorPayload(error));
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
  });
}

/** @deprecated Use assertAiCreditAvailable + chargeAiCredit */
export const requireAiCredit = assertAiCreditAvailable;

export { buildCreditErrorPayload };
