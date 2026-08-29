/**
 * Sheet Recipient Check Service
 *
 * Asynchronously checks Google Sheet content for valid recipients
 * based on the target campaign channel.
 *
 * Designed to be called by async orchestrators (e.g. aiCampaign.service.js)
 * and persisted into wizardState.gates.sheetCheck for synchronous gate evaluation.
 */

import { extractRecipientsFromGoogleSheet } from './recipientExtractor.service.js';

/**
 * Checks a Google Sheet for recipient contacts matching the target channel.
 *
 * @param {string} sheetUrl - Google Spreadsheet URL
 * @param {'email'|'zalo'|'zalo_group'|string} [channel] - Campaign channel
 * @param {object} [options]
 * @param {Function} [options.extractFn] - Optional extractor override for testing
 * @returns {Promise<{
 *   url: string,
 *   status: 'ok'|'wrong_channel'|'no_contact'|'not_public'|'invalid_url'|'too_many'|'unknown',
 *   emailCount?: number,
 *   phoneCount?: number,
 *   headers?: string[],
 *   detectedColumns?: object,
 *   totalCount?: number,
 *   limit?: number,
 *   error?: string,
 *   checkedAt: string
 * }>}
 */
export async function checkSheetForChannel(sheetUrl, channel = '', { extractFn = extractRecipientsFromGoogleSheet } = {}) {
  const cleanUrl = String(sheetUrl || '').trim();
  const checkedAt = new Date().toISOString();

  if (!cleanUrl) {
    return {
      url: cleanUrl,
      status: 'invalid_url',
      emailCount: 0,
      phoneCount: 0,
      headers: [],
      detectedColumns: {},
      checkedAt,
    };
  }

  const normChannel = String(channel || '').trim().toLowerCase();
  const isZalo = normChannel === 'zalo' || normChannel === 'zalo_group';
  const isEmail = normChannel === 'email';

  try {
    const extracted = await extractFn(cleanUrl);
    const emails = Array.isArray(extracted?.emails) ? extracted.emails : [];
    const phones = Array.isArray(extracted?.phones) ? extracted.phones : [];
    const headers = Array.isArray(extracted?.headers) ? extracted.headers : [];
    const detectedColumns = extracted?.detectedColumns || {};

    if (isZalo && phones.length === 0) {
      return {
        url: cleanUrl,
        status: 'wrong_channel',
        emailCount: emails.length,
        phoneCount: phones.length,
        headers,
        detectedColumns,
        checkedAt,
      };
    }

    if (isEmail && emails.length === 0) {
      return {
        url: cleanUrl,
        status: 'wrong_channel',
        emailCount: emails.length,
        phoneCount: phones.length,
        headers,
        detectedColumns,
        checkedAt,
      };
    }

    if (!isZalo && !isEmail && emails.length === 0 && phones.length === 0) {
      return {
        url: cleanUrl,
        status: 'no_contact',
        emailCount: emails.length,
        phoneCount: phones.length,
        headers,
        detectedColumns,
        checkedAt,
      };
    }

    return {
      url: cleanUrl,
      status: 'ok',
      emailCount: emails.length,
      phoneCount: phones.length,
      headers,
      detectedColumns,
      checkedAt,
    };
  } catch (err) {
    const code = err?.code || '';
    const headers = Array.isArray(err?.headers) ? err.headers : [];

    if (code === 'NO_RECIPIENTS_FOUND' || code === 'EMPTY_SPREADSHEET_DATA') {
      return {
        url: cleanUrl,
        status: 'no_contact',
        emailCount: 0,
        phoneCount: 0,
        headers,
        detectedColumns: {},
        checkedAt,
      };
    }

    if (code === 'SHEET_NOT_PUBLIC') {
      return {
        url: cleanUrl,
        status: 'not_public',
        emailCount: 0,
        phoneCount: 0,
        headers,
        detectedColumns: {},
        checkedAt,
      };
    }

    if (code === 'INVALID_SHEET_URL' || code === 'INVALID_SPREADSHEET_ID' || code === 'SPREADSHEET_PARSE_ERROR') {
      return {
        url: cleanUrl,
        status: 'invalid_url',
        emailCount: 0,
        phoneCount: 0,
        headers,
        detectedColumns: {},
        checkedAt,
      };
    }

    if (code === 'RECIPIENTS_LIMIT_EXCEEDED') {
      return {
        url: cleanUrl,
        status: 'too_many',
        limit: err.limit,
        totalCount: err.totalCount,
        emailCount: 0,
        phoneCount: 0,
        headers,
        detectedColumns: {},
        checkedAt,
      };
    }

    // Google 5xx, timeout, or transient network error: do not block users
    console.warn('[SheetRecipientCheck] Google fetch failed temporary:', err?.message || err);
    return {
      url: cleanUrl,
      status: 'unknown',
      error: err?.message || String(err),
      checkedAt,
    };
  }
}
