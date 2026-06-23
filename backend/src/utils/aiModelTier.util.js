/** Thứ hạng model Gemini (thấp → cao). */
export const AI_MODEL_TIERS = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

const TIER_INDEX = Object.fromEntries(
  AI_MODEL_TIERS.map((model, index) => [model, index])
);

/**
 * @param {string|null|undefined} model
 * @returns {string}
 */
export function normalizeModelId(model) {
  return String(model || '').trim().toLowerCase();
}

/**
 * @param {string|null|undefined} model
 * @returns {number}
 */
export function getModelTierIndex(model) {
  const normalized = normalizeModelId(model);
  if (!normalized) return 0;
  if (Object.prototype.hasOwnProperty.call(TIER_INDEX, normalized)) {
    return TIER_INDEX[normalized];
  }
  // Model lạ: coi như cao nhất để clamp xuống theo gói (an toàn).
  return AI_MODEL_TIERS.length;
}

/**
 * @param {string|null|undefined} requestedModel
 * @param {string|null|undefined} maxAllowedModel
 * @returns {string}
 */
export function clampModelToMax(requestedModel, maxAllowedModel) {
  const maxModel = normalizeModelId(maxAllowedModel) || DEFAULT_AI_MODEL;
  const requested = normalizeModelId(requestedModel) || maxModel;
  const reqIdx = getModelTierIndex(requested);
  const maxIdx = getModelTierIndex(maxModel);
  if (reqIdx <= maxIdx) {
    return Object.prototype.hasOwnProperty.call(TIER_INDEX, requested) ? requested : maxModel;
  }
  return maxModel;
}

/**
 * @param {string|null|undefined} maxModel
 * @returns {string[]}
 */
export function listModelsUpToTier(maxModel) {
  const maxIdx = getModelTierIndex(maxModel);
  return AI_MODEL_TIERS.filter((_, index) => index <= maxIdx);
}
