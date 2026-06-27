/**
 * Helpers for Gemini model metadata from Google ListModels.
 */

/**
 * @param {string|null|undefined} modelId
 */
export function normalizeGoogleModelId(modelId) {
  return String(modelId || '').trim().replace(/^models\//, '').toLowerCase();
}

/**
 * Skip preview/alias/non-chat models when syncing catalog inventory.
 *
 * @param {string} modelId
 */
export function isRelevantChatModel(modelId) {
  const id = normalizeGoogleModelId(modelId);
  if (!id.startsWith('gemini-')) return false;
  if (/preview|experimental|exp-|latest|image|audio|tts|robotics|computer-use|deep-research|nano-banana/i.test(id)) {
    return false;
  }
  return true;
}

/**
 * @param {object|null|undefined} googleModel
 */
export function extractGoogleModelMetadata(googleModel) {
  const modelId = normalizeGoogleModelId(googleModel?.name);
  return {
    modelId,
    displayName: String(googleModel?.displayName || '').trim() || modelId,
    description: String(googleModel?.description || '').trim() || null,
    version: String(googleModel?.version || '').trim() || null,
    inputTokenLimit: parsePositiveInt(googleModel?.inputTokenLimit),
    outputTokenLimit: parsePositiveInt(googleModel?.outputTokenLimit),
    thinking: googleModel?.thinking === true,
  };
}

/**
 * @param {number|null|undefined} value
 */
export function parsePositiveInt(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Human-readable token count for admin UI.
 *
 * @param {number|null|undefined} value
 */
export function formatTokenLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) {
    const millions = Math.round(n / 100_000) / 10;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const thousands = Math.round(n / 100) / 10;
    return Number.isInteger(thousands) ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return String(n);
}

/**
 * @param {{ outputTokenLimit?: number|null, inputTokenLimit?: number|null }} row
 */
export function capabilityScore(row) {
  return Number(row?.outputTokenLimit) || 0;
}
