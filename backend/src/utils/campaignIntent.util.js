/**
 * Pure text / intent heuristics for AI campaign assistant.
 * Moved out of aiCampaign.service.js (god-object split PR2).
 */

import { buildDataSourceQuestion } from '../services/ai/aiCampaignWizard.service.js';

export function langInstruction(locale) {
  return locale === 'en'
    ? 'Always respond in English. All "content" fields in JSON must be written in English.'
    : 'Luôn trả lời bằng tiếng Việt. Tất cả trường "content" trong JSON phải viết bằng tiếng Việt.';
}

export function lastUserMessageContent(history = []) {
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user');
  return String(lastUserMessage?.content || '');
}

export function hasExplicitCustomerSource(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /google\s*sheet|spreadsheet|docs\.google\.com\/spreadsheets|excel|xlsx|xls|csv|file|t[eệ]p|tập tin|landing page|khách hàng trong hệ thống|database|db|crm/.test(normalized);
}

export function looksLikeCampaignRequest(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /chiến dịch|chien dich|campaign|email|zalo|khách|khach|customer|tour|chuyến đi|chuyen di|du lịch|du lich/.test(normalized);
}

export function asksOnlyForGoogleSheet(response) {
  const text = [
    response?.content,
    ...(Array.isArray(response?.missing_fields) ? response.missing_fields : []),
  ].join(' ').toLowerCase();

  return response?.type === 'ask_more'
    && /google\s*sheet|spreadsheet|sheet\s*url|đường dẫn google sheet|docs\.google\.com\/spreadsheets/.test(text);
}

export function buildCampaignDataSourceQuestion(locale = 'vi') {
  // A4b: unify with wizard helper (manual + wizardGate)
  return buildDataSourceQuestion(locale);
}

export function isMultiDaySeriesRequest(text = '') {
  const normalized = String(text || '').toLowerCase();
  return /\d+\s*(tin nhắn|tin|email|ngày|ngay|message|messages|day|days)/i.test(normalized)
    && /(zalo|email|chiến dịch|chien dich|campaign|chăm sóc|cham soc|drip|đăng ký|dang ky|kêu gọi|keu goi|nhóm zalo|zalo nhóm|zalo group)/i.test(normalized);
}

export function looksLikeInlineSeriesDraft(content = '') {
  const matches = String(content || '').match(/tin nhắn\s*\d+|ngày\s*\d+|email\s*\d+|message\s*\d+|day\s*\d+/gi) || [];
  return matches.length >= 2;
}
