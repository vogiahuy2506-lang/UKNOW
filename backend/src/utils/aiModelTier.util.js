/** Thứ hạng model Gemini (thấp → cao). */
export const AI_MODEL_TIERS = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

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
  return tierIndex(model, AI_MODEL_TIERS);
}

/**
 * @param {string|null|undefined} model
 * @param {string[]} tiers
 * @returns {number}
 */
export function tierIndex(model, tiers = AI_MODEL_TIERS) {
  const normalized = normalizeModelId(model);
  const normalizedTiers = (Array.isArray(tiers) && tiers.length ? tiers : AI_MODEL_TIERS)
    .map(normalizeModelId)
    .filter(Boolean);
  if (!normalized) return 0;
  const index = normalizedTiers.indexOf(normalized);
  if (index >= 0) {
    return index;
  }
  // Model lạ: coi như cao nhất để clamp xuống theo gói (an toàn).
  return normalizedTiers.length;
}

/**
 * @param {string|null|undefined} requestedModel
 * @param {string|null|undefined} maxAllowedModel
 * @returns {string}
 */
export function clampModelToMax(requestedModel, maxAllowedModel) {
  return clampToTiers(requestedModel, maxAllowedModel, AI_MODEL_TIERS);
}

/**
 * @param {string|null|undefined} requestedModel
 * @param {string|null|undefined} maxAllowedModel
 * @param {string[]} tiers
 * @returns {string}
 */
export function clampToTiers(requestedModel, maxAllowedModel, tiers = AI_MODEL_TIERS) {
  const normalizedTiers = (Array.isArray(tiers) && tiers.length ? tiers : AI_MODEL_TIERS)
    .map(normalizeModelId)
    .filter(Boolean);
  const maxModel = normalizeModelId(maxAllowedModel) || DEFAULT_AI_MODEL;
  const requested = normalizeModelId(requestedModel) || maxModel;
  const reqIdx = tierIndex(requested, normalizedTiers);
  const maxIdx = tierIndex(maxModel, normalizedTiers);
  if (reqIdx <= maxIdx) {
    return normalizedTiers.includes(requested) ? requested : maxModel;
  }
  return maxModel;
}

/**
 * @param {string|null|undefined} maxModel
 * @returns {string[]}
 */
export function listModelsUpToTier(maxModel) {
  return listUpToTier(maxModel, AI_MODEL_TIERS);
}

/**
 * @param {string|null|undefined} maxModel
 * @param {string[]} tiers
 * @returns {string[]}
 */
export function listUpToTier(maxModel, tiers = AI_MODEL_TIERS) {
  const normalizedTiers = (Array.isArray(tiers) && tiers.length ? tiers : AI_MODEL_TIERS)
    .map(normalizeModelId)
    .filter(Boolean);
  const maxIdx = tierIndex(maxModel, normalizedTiers);
  return normalizedTiers.filter((_, index) => index <= maxIdx);
}
