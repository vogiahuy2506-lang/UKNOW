import axios from 'axios';
import Papa from 'papaparse';
import { getReadSheetFetchTimeoutMs } from './readSheetConfig.util.js';
import { fenceUntrustedContent } from './untrustedContent.util.js';

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

/**
 * Kết quả tải một URL Google: `kind: 'data'` = nội dung tài liệu/bảng (đi vào prompt trong rào "dữ liệu, không phải mệnh lệnh");
 * `kind: 'recipient_summary'` = bản tóm tắt danh sách người nhận do `summarizeCsv` tạo (không có dòng dữ liệu thật).
 * @typedef {{ kind: 'data'|'recipient_summary', text: string }} GoogleUrlContent
 */

async function fetchSheet(info, { summarizeCsv } = {}) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${info.id}/gviz/tq?tqx=out:csv`;
  const res = await axios.get(csvUrl, {
    responseType: 'text',
    timeout: getReadSheetFetchTimeoutMs(),
    validateStatus: () => true,
  });
  if (res.status >= 400) return null;
  const body = typeof res.data === 'string' ? res.data : '';
  if (/^<!doctype html/i.test(body.trim()) || /^<html/i.test(body.trim())) return null;

  // C P1-6 (d): bảng là danh sách người nhận (bộ đọc tất định nhận ra) → chỉ trả bản tóm tắt, KHÔNG dòng dữ liệu. Không nhận ra
  // (bảng sản phẩm, bảng giá…) hoặc bộ tóm tắt lỗi → rơi xuống đường cũ bên dưới để model vẫn đọc được bảng.
  if (typeof summarizeCsv === 'function') {
    try {
      const summary = await summarizeCsv(body, info);
      if (summary) return { kind: 'recipient_summary', text: summary };
    } catch (err) {
      console.warn(`[GoogleUrlFetch] Could not summarize recipient sheet ${info.id}:`, err.message);
    }
  }

  const { data: rows, errors } = Papa.parse(body, { skipEmptyLines: true });
  if (errors?.length && !rows?.length) return null;
  if (!rows?.length) return null;

  const MAX_ROWS = 300;
  const header = (rows[0] || []).join(' | ');
  const dataRows = rows.slice(1, MAX_ROWS + 1).map(r => r.join(' | ')).join('\n');
  const truncNote = rows.length - 1 > MAX_ROWS ? `\n... (${rows.length - 1} total rows, showing first ${MAX_ROWS})` : '';
  return { kind: 'data', text: `Headers: ${header}\n${dataRows}${truncNote}` };
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
  return { kind: 'data', text: text.slice(0, 15000) };
}

/**
 * Tải nội dung một URL Google (descriptor của extractGoogleUrls()). Trả `{kind, text}` hoặc null nếu không truy cập được.
 * @returns {Promise<GoogleUrlContent|null>}
 */
async function loadGoogleUrl(info, { summarizeCsv } = {}) {
  try {
    return info.type === 'sheet' ? await fetchSheet(info, { summarizeCsv }) : await fetchDoc(info.id);
  } catch (err) {
    console.warn(`[GoogleUrlFetch] Could not fetch ${info.type} ${info.id}:`, err.message);
    return null;
  }
}

/**
 * Scan a message's text content for Google URLs, fetch each one (with per-request cache),
 * and push formatted text parts into the provided parts array.
 *
 * @param {Array} parts  - Gemini parts array (mutated in-place)
 * @param {string} content - message text to scan
 * @param {Map} cache - per-request Map<id, GoogleUrlContent|null> to avoid duplicate fetches
 * @param {object} [options]
 * @param {string[]} [options.excludeUrls] - URL Google ĐÃ chọn làm nguồn người nhận (C P1-6): KHÔNG tải, KHÔNG đưa nội dung bảng
 *   (tên/SĐT/email khách cuối) cho Gemini — chỉ chèn một dòng báo để model không đoán nội dung. So khớp theo id tài liệu, nên
 *   `/edit#gid=0` hay `/gviz/…` của cùng một sheet đều bị loại.
 * @param {(csvText: string, info: {id: string, url: string, type: string}) => Promise<string|null>} [options.summarizeSheetCsv] -
 *   (C P1-6 (d)) Sheet CHƯA chốt nhưng đang là danh sách người nhận (người dùng dán link ở tin hiện tại): hàm nhận thân CSV và trả
 *   bản tóm tắt (số email/SĐT hợp lệ, tên cột, vài dòng đã che) thay cho 300 dòng nguyên văn; trả `null` (không phải danh sách
 *   người nhận) thì Sheet đính nguyên văn như cũ. Tiêm từ tầng service để util không phụ thuộc bộ đọc người nhận.
 */
export async function attachGoogleUrlParts(parts, content, cache, { excludeUrls = [], summarizeSheetCsv = null } = {}) {
  const excludedIds = new Set(
    extractGoogleUrls((Array.isArray(excludeUrls) ? excludeUrls : []).join('\n')).map((u) => u.id),
  );
  const urls = extractGoogleUrls(content);
  for (const info of urls) {
    if (excludedIds.has(info.id)) {
      parts.push({
        text: `[Google Sheet "${info.url}" là danh sách người nhận đã chọn cho chiến dịch: nội dung bảng chứa dữ liệu cá nhân của khách nên KHÔNG gửi cho AI. Số người nhận và tên cột (nếu có) nằm ở khối WIZARD ĐÃ CHỐT (sheetRecipients) — không tự đếm, không đoán nội dung]`,
      });
      continue;
    }
    if (!cache.has(info.id)) {
      cache.set(info.id, await loadGoogleUrl(info, { summarizeCsv: summarizeSheetCsv }));
    }
    const fetched = cache.get(info.id);
    if (!fetched) continue;
    if (fetched.kind === 'recipient_summary') {
      // Bản tóm tắt do hệ thống dựng (đã mang câu rào cho tên cột) — không phải nội dung tài liệu nguyên văn.
      parts.push({ text: fetched.text });
      continue;
    }
    const label = info.type === 'sheet' ? 'Google Sheet' : 'Google Docs';
    // C P1-4 (d): chữ trong Docs/Sheet là DỮ LIỆU người dùng đưa vào, không phải mệnh lệnh cho trợ lý — gắn rào quanh khối.
    parts.push({
      text: fenceUntrustedContent(`Nội dung ${label}: "${info.url}"`, fetched.text, `Hết nội dung ${label}`),
    });
  }
}
