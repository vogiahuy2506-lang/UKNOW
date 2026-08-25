/**
 * Google Sheet URL validation util matching backend GOOGLE_SHEET_URL_RE.
 */
export const GOOGLE_SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/\S+/i;

export function isValidGoogleSheetUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return GOOGLE_SHEET_URL_RE.test(url.trim());
}
