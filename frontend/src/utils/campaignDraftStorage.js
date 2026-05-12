const CAMPAIGN_DRAFT_STORAGE_KEY = 'founder_ai_campaign_builder_draft';

/**
 * Read temporary campaign draft from session storage.
 *
 * @returns {Object|null} Campaign draft object or null when unavailable.
 */
export const readCampaignDraft = () => {
  try {
    const raw = sessionStorage.getItem(CAMPAIGN_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Persist temporary campaign draft to session storage.
 *
 * @param {Object} draft Campaign draft payload.
 * @returns {void}
 */
export const writeCampaignDraft = (draft) => {
  try {
    sessionStorage.setItem(CAMPAIGN_DRAFT_STORAGE_KEY, JSON.stringify(draft || {}));
  } catch {
    // Ignore storage quota/private mode failures.
  }
};

/**
 * Remove temporary campaign draft from session storage.
 *
 * @returns {void}
 */
export const clearCampaignDraft = () => {
  try {
    sessionStorage.removeItem(CAMPAIGN_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};
