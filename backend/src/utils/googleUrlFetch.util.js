import axios from 'axios';
import Papa from 'papaparse';
import { getReadSheetFetchTimeoutMs } from './readSheetConfig.util.js';

const SHEET_URL_RE = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+(?:\/[^\s)"'\]]*)?/g;
const DOC_URL_RE   = /https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+(?:\/[^\s)"'\]]*)?/g;

/** Extract all Google Sheet / Docs URLs from a string, deduplicated by doc ID. */
export function extractGoogleUrls(text) {
  const seen = new Set();
  const results = [];

  for (const m of String(text || '').matchAll(SHEET_URL_RE)) {
    const id = m[0].match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (id && !seen.has(id)) { seen.add(id); results.push({ type: 'sheet', url: m[0], id }); }
  }
  for (const m of String(text || '').matchAll(DOC_URL_RE)) {
    const id = m[0].match(/document\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (id && !seen.has(id)) { seen.add(id); results.push({ type: 'doc', url: m[0], id }); }
  }
  return results;
}

async function fetchSheet(id) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  const res = await axios.get(csvUrl, {
    responseType: 'text',
    timeout: getReadSheetFetchTimeoutMs(),
    validateStatus: () => true,
  });
  if (res.status >= 400) return null;
  const body = typeof res.data === 'string' ? res.data : '';
  if (/^<!doctype html/i.test(body.trim()) || /^<html/i.test(body.trim())) return null;

  const { data: rows, errors } = Papa.parse(body, { skipEmptyLines: true });
  if (errors?.length && !rows?.length) return null;
  if (!rows?.length) return null;

  const MAX_ROWS = 300;
  const header = (rows[0] || []).join(' | ');
  const dataRows = rows.slice(1, MAX_ROWS + 1).map(r => r.join(' | ')).join('\n');
  const truncNote = rows.length - 1 > MAX_ROWS ? `\n... (${rows.length - 1} total rows, showing first ${MAX_ROWS})` : '';
  return `Headers: ${header}\n${dataRows}${truncNote}`;
}

async function fetchDoc(id) {
  const url = `https://docs.google.com/document/d/${id}/export?format=txt`;
  const res = await axios.get(url, {
    responseType: 'text',
    timeout: getReadSheetFetchTimeoutMs(),
    validateStatus: () => true,
  });
  if (res.status >= 400) return null;
  const text = typeof res.data === 'string' ? res.data : '';
  if (/^<!doctype html/i.test(text.trim())) return null;
  return text.slice(0, 15000);
}

/**
 * Fetch content from a Google URL descriptor returned by extractGoogleUrls().
 * Returns formatted text string, or null if inaccessible (private/invalid).
 */
export async function fetchGoogleUrlContent({ type, id }) {
  try {
    return type === 'sheet' ? await fetchSheet(id) : await fetchDoc(id);
  } catch (err) {
    console.warn(`[GoogleUrlFetch] Could not fetch ${type} ${id}:`, err.message);
    return null;
  }
}

/**
 * Scan a message's text content for Google URLs, fetch each one (with per-request cache),
 * and push formatted text parts into the provided parts array.
 *
 * @param {Array} parts  - Gemini parts array (mutated in-place)
 * @param {string} content - message text to scan
 * @param {Map} cache - per-request Map<id, content|null> to avoid duplicate fetches
 */
export async function attachGoogleUrlParts(parts, content, cache) {
  const urls = extractGoogleUrls(content);
  for (const info of urls) {
    if (!cache.has(info.id)) {
      cache.set(info.id, await fetchGoogleUrlContent(info));
    }
    const fetched = cache.get(info.id);
    if (fetched) {
      const label = info.type === 'sheet' ? 'Google Sheet' : 'Google Docs';
      parts.push({
        text: `[Nội dung ${label}: "${info.url}"]:\n${fetched}\n[Hết nội dung ${label}]`,
      });
    }
  }
}
