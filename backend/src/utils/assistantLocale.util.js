/**
 * Pure assistant locale resolver (M3).
 * Separates uiLocale / conversationLocale / contentLocale without HTTP/DB/model deps.
 */

const LOCALES = new Set(['vi', 'en']);

const WIZARD_MARKER_LINE_RE = /^\[wizard\]\{/i;
const URL_RE = /https?:\/\/\S+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ID_OR_NUMBER_RE = /\b\d[\d._-]*\b/g;

/** Explicit “reply/speak in …” — conversation only (no bare “bằng tiếng Anh”). */
const EXPLICIT_CONVERSATION_EN_RE = /\b(?:please\s+)?(?:reply|respond|answer|speak|talk|chat|continue)\s+(?:to\s+me\s+)?(?:in\s+)?english\b|\bin\s+english\s+please\b/i;
const EXPLICIT_CONVERSATION_VI_RE = /(?:trả\s*lời|tra\s*loi|nói\s*chuyện|noi\s*chuyen|trò\s*chuyện|tro\s*chuyen|đối\s*thoại|doi\s*thoai|chat)\s+(?:(?:cho\s+mình|cho\s+toi|với\s+tôi|voi\s+toi)\s+)?(?:bằng\s+|bang\s+)?(?:tiếng\s*anh|tieng\s*anh|english)/i;
const EXPLICIT_CONVERSATION_TO_VI_RE = /(?:trả\s*lời|tra\s*loi|nói\s*chuyện|noi\s*chuyen|reply|respond|answer|speak)\s+(?:(?:cho\s+mình|cho\s+toi)\s+)?(?:bằng\s+|bang\s+|in\s+)?(?:tiếng\s*việt|tieng\s*viet|vietnamese)|\breply\s+in\s+vietnamese\b|\brespond\s+in\s+vietnamese\b|\banswer\s+in\s+vietnamese\b/i;

/**
 * Explicit artifact language — content only.
 * Prefer “bằng tiếng …” / “write the email in English”; avoid topic phrases like
 * “email about studying in English”.
 */
const CONTENT_ARTIFACT_RE = '(?:email|mail|tin(?:\\s*nhắn|\\s*nhan)?|message|zalo(?:\\s*(?:tin|message))?|landing(?:\\s*page)?|nội\\s*dung|noi\\s*dung|copy|content|subject|body|it|this|them)';
const EXPLICIT_CONTENT_EN_RE = new RegExp(
  `(?:viết|viet|soạn|soan)\\s+.{0,40}(?:bằng|bang)\\s*(?:tiếng\\s*anh|tieng\\s*anh|english)`
  + `|(?:write|draft|compose|create)\\s+(?:(?:the|this|an?|a|lại|lai|một|mot)\\s+)*${CONTENT_ARTIFACT_RE}\\s+(?:(?:này|nay|this|out|again)\\s+)?(?:in\\s+english)\\b`
  + `|(?:write|draft|compose)\\s+(?:it|this|them)\\s+in\\s+english\\b`
  + `|(?:bằng|bang)\\s*(?:tiếng\\s*anh|tieng\\s*anh).{0,40}(?:email|mail|tin|message|zalo|landing|nội\\s*dung|noi\\s*dung)`,
  'i',
);
const EXPLICIT_CONTENT_VI_RE = new RegExp(
  `(?:viết|viet|soạn|soan|hãy\\s+viết|hay\\s+viet)\\s+.{0,40}(?:bằng|bang)\\s*(?:tiếng\\s*việt|tieng\\s*viet|vietnamese)`
  + `|(?:write|draft|compose|create)\\s+(?:(?:the|this|an?|a|lại|lai|một|mot)\\s+)*${CONTENT_ARTIFACT_RE}\\s+(?:(?:này|nay|this|out|again)\\s+)?(?:in\\s+vietnamese)\\b`
  + `|(?:write|draft|compose)\\s+(?:it|this|them)\\s+in\\s+vietnamese\\b`
  + `|(?:bằng|bang)\\s*(?:tiếng\\s*việt|tieng\\s*viet).{0,40}(?:email|mail|tin|message|zalo|landing|nội\\s*dung|noi\\s*dung)`,
  'i',
);

/** Negated content-language clauses — strip so a later positive clause can win. */
const NEGATED_CONTENT_LOCALE_RE = /(?:don't|do\s*not|never|không|khong|đừng|dung)\s+(?:[\p{L}']+\s+){0,6}(?:write|viết|viet|soạn|soan|draft|compose).{0,40}?(?:bằng|bang|in\s+)?(?:tiếng\s*anh|tieng\s*anh|english|tiếng\s*việt|tieng\s*viet|vietnamese)/giu;

const LANDING_ORIENTED_RE = /(?:landing\s*page|trang\s*(?:đích|dich|landing)|tạo\s*landing|tao\s*landing|create\s+(?:an?\s+)?landing|draft\s+landing|soạn\s*landing|soan\s*landing)/i;
const CAMPAIGN_WINS_OVER_LANDING_RE = /(?:(?:create|tạo|tao|draft|soạn|soan|write|viết|viet|build)\s+.{0,48}(?:email\s+campaign|zalo\s+campaign|chiến\s*dịch|chien\s*dich|\bcampaign\b)|(?:chiến\s*dịch|chien\s*dich|email\s+campaign|zalo\s+campaign))/i;
const CAMPAIGN_ASSISTANT_TYPES = new Set([
  'ask_campaign_details',
  'content_plan',
  'confirm_create',
  'create_and_run',
  'template_draft',
]);

const EN_SIGNAL_RE = /\b(?:the|and|for|with|please|please|you|your|this|that|have|has|from|into|about|would|could|should|need|want|help|email|campaign|landing|message|customer|create|write|reply|respond|thank|thanks|upgrade|password|login|payment|billing)\b/gi;
const VI_FUNCTION_RE = /\b(?:và|của|cho|với|không|được|là|một|những|các|trong|này|khi|rồi|bạn|mình|tôi|giúp|tạo|viết|gửi|chiến|dịch|email|tin|nhắn|khách|hàng|trả|lời|tiếng)\b/gi;
const VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;

export function normalizeAssistantLocale(value, fallback = 'vi') {
  const raw = String(value || '').trim().toLowerCase();
  if (LOCALES.has(raw)) return raw;
  return LOCALES.has(fallback) ? fallback : 'vi';
}

function stripNoise(text = '') {
  return String(text || '')
    .replace(URL_RE, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(ID_OR_NUMBER_RE, ' ')
    .replace(/[^\p{L}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alphabeticTokens(text = '') {
  return stripNoise(text)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /[\p{L}]{2,}/u.test(t));
}

function letterCharCount(text = '') {
  const m = String(text || '').match(/[\p{L}]/gu);
  return m ? m.length : 0;
}

export function isWizardMarkerUserText(text = '') {
  const first = String(text || '').split('\n')[0]?.trim() || '';
  return WIZARD_MARKER_LINE_RE.test(first) || /^\{[\s\S]*"gate"\s*:/.test(first);
}

export function extractLatestUserText(history = []) {
  const messages = Array.isArray(history) ? history : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    const content = String(msg?.content || '').trim();
    if (!content) continue;
    if (isWizardMarkerUserText(content)) continue;
    return content;
  }
  return '';
}

export function detectExplicitConversationLocale(text = '') {
  const raw = String(text || '').trim();
  if (!raw || isWizardMarkerUserText(raw)) return null;
  // Narrow negation: "don't reply in English" / "không trả lời tiếng Anh"
  if (/(?:don't|do\s*not|never|không|khong|đừng|dung)\s+(?:[\p{L}']+\s+){0,4}(?:reply|respond|answer|trả\s*lời|tra\s*loi).{0,24}(?:english|tiếng\s*anh|tieng\s*anh)/iu.test(raw)) {
    return null;
  }
  if (EXPLICIT_CONVERSATION_TO_VI_RE.test(raw)) return 'vi';
  if (EXPLICIT_CONVERSATION_EN_RE.test(raw) || EXPLICIT_CONVERSATION_VI_RE.test(raw)) return 'en';
  return null;
}

export function detectExplicitContentLocale(text = '') {
  const raw = String(text || '').trim();
  if (!raw || isWizardMarkerUserText(raw)) return null;
  // Drop negated clauses ("Don't write in English; …") so a later positive wins.
  const cleaned = raw.replace(NEGATED_CONTENT_LOCALE_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (EXPLICIT_CONTENT_VI_RE.test(cleaned)) return 'vi';
  if (EXPLICIT_CONTENT_EN_RE.test(cleaned)) return 'en';
  return null;
}

export function detectTextLocale(text = '') {
  const raw = String(text || '').trim();
  if (!raw || isWizardMarkerUserText(raw)) return null;

  const cleaned = stripNoise(raw);
  const tokens = alphabeticTokens(cleaned);
  if (tokens.length < 4 || letterCharCount(cleaned) < 20) return null;

  const joined = tokens.join(' ');
  const enMatches = joined.match(EN_SIGNAL_RE) || [];
  const viFunc = joined.match(VI_FUNCTION_RE) || [];
  const viMarks = (joined.match(VI_DIACRITIC_RE) || []).length > 0 ? Math.min(3, Math.ceil((joined.match(VI_DIACRITIC_RE) || []).length / 2)) : 0;
  const enScore = new Set(enMatches.map((t) => t.toLowerCase())).size;
  const viScore = new Set(viFunc.map((t) => t.toLowerCase())).size + viMarks;

  if (enScore >= 3 && enScore - viScore >= 2) return 'en';
  if (viScore >= 3 && viScore - enScore >= 2) return 'vi';
  return null;
}

function isCampaignWizardMarkerText(text = '') {
  const first = String(text || '').split('\n')[0]?.trim() || '';
  if (!WIZARD_MARKER_LINE_RE.test(first) && !/^\{[\s\S]*"gate"\s*:/.test(first)) return false;
  // Landing wizard answers are rare; any wizard gate marker resumes campaign flow.
  return true;
}

/**
 * True when the latest turn is about creating/editing a landing page (not campaign).
 * Newest campaign intent / wizard marker / campaign cards beat a stale ask_landing_details.
 */
export function isLandingOrientedTurn(history = []) {
  const msgs = Array.isArray(history) ? history : [];
  const start = Math.max(0, msgs.length - 10);
  for (let i = msgs.length - 1; i >= start; i -= 1) {
    const msg = msgs[i];
    if (!msg) continue;

    if (msg.role === 'user') {
      const raw = String(msg.content || '').trim();
      if (!raw) continue;
      if (isCampaignWizardMarkerText(raw)) return false;
      if (isWizardMarkerUserText(raw)) continue;
      if (LANDING_ORIENTED_RE.test(raw)) return true;
      if (CAMPAIGN_WINS_OVER_LANDING_RE.test(raw)) return false;
      continue;
    }

    if (msg.type === 'ask_landing_details') return true;
    if (CAMPAIGN_ASSISTANT_TYPES.has(msg.type)) return false;
  }
  return false;
}

/**
 * @returns {{
 *   uiLocale: 'vi'|'en',
 *   conversationLocale: 'vi'|'en',
 *   contentLocale: 'vi'|'en',
 *   conversationLocaleSource: 'explicit'|'session'|'detected'|'ui_default',
 *   contentLocaleSource: 'explicit'|'brief'|'conversation_default',
 * }}
 */
export function resolveAssistantLocaleContext({
  history = [],
  uiLocale = 'vi',
  persistedConversationLocale = null,
  briefContentLocale = null,
} = {}) {
  const ui = normalizeAssistantLocale(uiLocale, 'vi');
  const latest = extractLatestUserText(history);

  const explicitConversation = detectExplicitConversationLocale(latest);
  let conversationLocale;
  let conversationLocaleSource;
  if (explicitConversation) {
    conversationLocale = explicitConversation;
    conversationLocaleSource = 'explicit';
  } else if (LOCALES.has(persistedConversationLocale)) {
    // Sticky: never re-detect after session has a locale.
    conversationLocale = persistedConversationLocale;
    conversationLocaleSource = 'session';
  } else {
    const detected = detectTextLocale(latest);
    if (detected) {
      conversationLocale = detected;
      conversationLocaleSource = 'detected';
    } else {
      conversationLocale = ui;
      conversationLocaleSource = 'ui_default';
    }
  }

  const explicitContent = detectExplicitContentLocale(latest);
  let contentLocale;
  let contentLocaleSource;
  if (explicitContent) {
    contentLocale = explicitContent;
    contentLocaleSource = 'explicit';
  } else if (LOCALES.has(briefContentLocale)) {
    contentLocale = briefContentLocale;
    contentLocaleSource = 'brief';
  } else {
    contentLocale = conversationLocale;
    contentLocaleSource = 'conversation_default';
  }

  return {
    uiLocale: ui,
    conversationLocale,
    contentLocale,
    conversationLocaleSource,
    contentLocaleSource,
  };
}

export function buildAssistantLanguageInstructions(localeContext = {}) {
  const conversation = normalizeAssistantLocale(localeContext.conversationLocale, 'vi');
  const content = normalizeAssistantLocale(localeContext.contentLocale, conversation);
  const replyLine = conversation === 'en'
    ? 'ASSISTANT_REPLY_LANGUAGE: Reply to the user in English. Top-level response "content", free-form questions, and help answers must be English.'
    : 'ASSISTANT_REPLY_LANGUAGE: Trả lời người dùng bằng tiếng Việt. Trường "content" cấp cao, câu hỏi/giải thích tự do và câu trả lời help phải bằng tiếng Việt.';
  const contentLine = content === 'en'
    ? 'CUSTOMER_CONTENT_LANGUAGE: Customer-facing artifacts (email subject/bodyHtml/bodyText, Zalo message, landing copy/HTML, campaign script and content-plan slot copy) must be written in English.'
    : 'CUSTOMER_CONTENT_LANGUAGE: Nội dung gửi khách (email subject/bodyHtml/bodyText, tin Zalo, copy/HTML landing, script chiến dịch và nội dung slot content-plan) phải viết bằng tiếng Việt.';
  const cardLine = 'Do NOT translate server-built deterministic card labels/options; those follow uiLocale. Do not translate IDs, enums, markers, HTML attributes, template variables, or user-provided product names.';
  return `${replyLine}\n${contentLine}\n${cardLine}`;
}

/** Backward-compatible wrapper: old callers passed a single locale for everything. */
export function langInstruction(locale = 'vi') {
  return buildAssistantLanguageInstructions({
    conversationLocale: locale,
    contentLocale: locale,
    uiLocale: locale,
  });
}

export default {
  normalizeAssistantLocale,
  detectExplicitConversationLocale,
  detectExplicitContentLocale,
  detectTextLocale,
  isLandingOrientedTurn,
  resolveAssistantLocaleContext,
  buildAssistantLanguageInstructions,
  langInstruction,
  extractLatestUserText,
  isWizardMarkerUserText,
};
