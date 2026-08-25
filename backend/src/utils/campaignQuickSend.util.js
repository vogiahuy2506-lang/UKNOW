/**
 * Pure quick-send intent helpers for CampaignBrief PR-B.
 * Kept free of wizard/campaignIntent imports to avoid cycles.
 */

const QUICK_SEND_RE = /(?:gửi\s*nhanh|gui\s*nhanh|quick\s*send|send\s*one\s*(?:email|message)|gửi\s*1\s*(?:email|tin|thư)|gui\s*1\s*(?:email|tin|thu)|gửi\s*một\s*(?:email|tin|thư)|gui\s*mot\s*(?:email|tin|thu)|send\s*(?:a\s*)?single\s*(?:email|message)|gửi\s*(?:1|một|mot)\s*lần|gui\s*(?:1|một|mot)\s*lan|gửi\s*(?:1|một|mot)\s*mình|gui\s*(?:1|một|mot)\s*minh|send\s*once)/i;

const QUICK_SEND_PHRASE_RE = /(?:gửi\s*nhanh|gui\s*nhanh|quick\s*send|send\s*one|send\s*(?:a\s*)?single|gửi\s*(?:1|một|mot)\s*(?:lần|mình)|gui\s*(?:1|một|mot)\s*(?:lan|minh)|send\s*once)/i;

/** Clause / contrast boundaries — negation must not cross these into a positive quick-send.
 *  Note: chỉ/just stay as fillers (e.g. "không muốn chỉ gửi nhanh"), not splitters.
 */
const QUICK_SEND_CLAUSE_SPLIT_RE = /(?:[,.;:!?…—–]|[\n\r]+|\bmà\b|\bnhưng\b|\bnhung\b|\bbut\b|\binstead\b)+/iu;

/**
 * Whitelist fillers allowed between negator and quick-send phrase (same clause only).
 * Arbitrary content like "quảng bá sản phẩm" must NOT count as negation of a later quick-send.
 */
const QUICK_SEND_NEGATION_FILLER_RE = /(?:muốn|muon|cần|can|có|co|phải|phai|chỉ|chi|just|sử\s*dụng|su\s*dung|want|use|using|to|a|an|the|cái|cai)\s+/iu;

const QUICK_SEND_NEGATOR_RE = /(?:đừng|dung|đừng\s*có|dung\s*co|không|khong|chưa|chua|never|don't|do\s*not|\bnot\b)\s+/iu;

/**
 * True when a quick-send phrase in the same clause is negated.
 * Stops at mà/nhưng/chỉ/but/just/instead and punctuation so contrast clauses stay positive.
 */
export function hasQuickSendNegation(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;

  const clauses = raw.split(QUICK_SEND_CLAUSE_SPLIT_RE);
  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed || !QUICK_SEND_PHRASE_RE.test(trimmed)) continue;

    // "không phải gửi nhanh" / "không gửi nhanh" / "don't want a quick send"
    const negMatch = trimmed.match(QUICK_SEND_NEGATOR_RE);
    if (!negMatch) continue;

    const afterNeg = trimmed.slice(negMatch.index + negMatch[0].length);
    // Consume only whitelist fillers, then require quick-send phrase immediately.
    let rest = afterNeg;
    for (let i = 0; i < 4; i += 1) {
      const filler = rest.match(QUICK_SEND_NEGATION_FILLER_RE);
      if (!filler || filler.index !== 0) break;
      rest = rest.slice(filler[0].length);
    }
    if (QUICK_SEND_PHRASE_RE.test(rest) && rest.search(QUICK_SEND_PHRASE_RE) === 0) {
      return true;
    }
  }
  return false;
}

const MULTI_DAY_SERIES_RE_CTX = /(zalo|email|chiến dịch|chien dich|campaign|chăm sóc|cham soc|drip|đăng ký|dang ky|kêu gọi|keu goi|nhóm zalo|zalo nhóm|zalo group|trong\s+\d+\s*(?:ngày|ngay|day)|chuỗi|chuoi)/i;

const NON_PRODUCT_PURPOSE_RE = /cảm\s*ơn|cam\s*on|thank(?:s|\s*you)?|thông\s*báo|thong\s*bao|announc(?:e|ement)?|xác\s*nhận|xac\s*nhan|confirm(?:ation)?|nhắc\s*lịch|nhac\s*lich|remind(?:er)?|chào\s*mừng|chao\s*mung|welcome/i;

/** Only explicit multi-product / multi-course language — never bare "nhiều". */
const EXPLICIT_MULTI_PRODUCT_RE = /(?:nhiều|nhieu)\s+(?:sản\s*phẩm|san\s*pham|khóa\s*học|khoa\s*hoc|khóa|khoa|products?|courses?)|multiple\s+(?:products?|courses?)|all\s+(?:courses?|products?)|(?:tất\s*cả|tat\s*ca)\s+(?:sản\s*phẩm|san\s*pham|khóa\s*học|khoa\s*hoc|khóa|khoa|products?|courses?)/i;

function normalizeNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Multi-day / drip series. Requires count >= 2 so "1 email" is not treated as a series.
 */
export function isMultiDaySeriesRequestLocal(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (!MULTI_DAY_SERIES_RE_CTX.test(normalized)) return false;

  // "N email/tin trong M ngày"
  const windowMatch = normalized.match(
    /(\d+)\s*(?:tin nhắn|tin nhan|tin|email|message|messages).{0,48}(?:trong|in|over)\s*(\d+)\s*(?:ngày|ngay|day|days)/i
  );
  if (windowMatch) {
    const n = Number(windowMatch[1]);
    const days = Number(windowMatch[2]);
    return (Number.isFinite(n) && n >= 2) || (Number.isFinite(days) && days >= 2);
  }

  const countMatch = normalized.match(/(\d+)\s*(?:tin nhắn|tin nhan|tin|email|message|messages|ngày|ngay|day|days)/i);
  if (!countMatch) return false;
  const count = Number(countMatch[1]);
  return Number.isFinite(count) && count >= 2;
}

/**
 * Narrow VI/EN markers for one-shot quick send. Multi-day series wins (returns false).
 * Generic "tạo chiến dịch" must NOT match. Negation ("đừng gửi nhanh") must NOT match.
 */
export function isQuickSendRequest(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (isMultiDaySeriesRequestLocal(raw)) return false;
  if (hasQuickSendNegation(raw)) return false;
  return QUICK_SEND_RE.test(raw);
}

/** Địa chỉ email trong câu — tín hiệu email mạnh ngang chữ "email". */
const EMAIL_ADDRESS_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Từ chung chỉ "tin nhắn", KHÔNG phải dấu hiệu riêng của Zalo. */
const GENERIC_MESSAGE_RE = /tin nhắn|tin nhan/;

/**
 * Chọn kênh theo tín hiệu tường minh, ưu tiên tên sản phẩm hơn từ chung.
 *
 * Trước 24/08/2026 hai hàm suy luận kênh đều xếp `tin nhắn` chung một nhánh với
 * `zalo` và đặt nhánh đó TRƯỚC nhánh email. Hệ quả: câu "gửi nhanh cho tôi tin
 * nhắn đến email abc@gmail.com" bị đọc thành Zalo và trợ lý hỏi chọn tài khoản
 * Zalo, dù người dùng đã nói rõ email kèm địa chỉ.
 *
 * `tin nhắn` trong tiếng Việt chỉ có nghĩa "message", dùng cho cả email lẫn
 * Zalo — nên nó chỉ được quyết định khi câu không có tín hiệu email nào.
 *
 * @param {string} normalized Câu đã lowercase.
 * @param {RegExp} emailRe Bộ từ khoá email riêng của từng hàm gọi.
 * @returns {'zalo'|'email'|null}
 */
export function pickChannelByExplicitSignal(normalized, emailRe) {
  const hasZaloPersonal = /zalo\s*cá\s*nhân|zalo\s*ca\s*nhan|zalo\s*personal/.test(normalized);
  const hasZalo = /\bzalo\b/.test(normalized);
  const hasEmail = emailRe.test(normalized) || EMAIL_ADDRESS_RE.test(normalized);

  if (hasZaloPersonal) return 'zalo';
  if (hasZalo && hasEmail) return null; // Ambiguous, let it ask
  if (hasZalo) return null; // Knows it's Zalo, but needs to disambiguate personal vs group. So return null to trigger channel question.
  if (hasEmail) return 'email';
  
  return null;
}

export function inferQuickSendChannel(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (/zalo\s*group|zalo\s*nh[oó]m|nh[oó]m\s*zalo|gửi\s*nh[oó]m|gui\s*nhom/.test(normalized)) {
    return 'zalo_group';
  }
  return pickChannelByExplicitSignal(normalized, /\bemail\b|gửi mail|gui mail|thư|thu\b|mail\b/);
}

function matchExactCatalogNames(sourcePrompt, courses = []) {
  const text = normalizeNameKey(sourcePrompt);
  if (!text) return [];
  const haystack = ` ${text} `;
  const matched = [];
  for (const course of courses) {
    const name = normalizeNameKey(course.name || course.course_name);
    if (!name) continue;
    if (haystack.includes(` ${name} `)) matched.push(Number(course.id));
  }
  return [...new Set(matched.filter((id) => Number.isInteger(id) && id > 0))];
}

/**
 * Infer a ready CampaignBrief fragment from free text + catalog.
 * Precedence: exact catalog name(s) → explicit multi-product → known non-product purpose → null.
 * @returns {object|null} partial brief (contentMode/productMode/...) or null if still need card
 */
export function inferCampaignBriefFromText(text = '', courses = []) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const matchedIds = matchExactCatalogNames(raw, courses);
  if (matchedIds.length >= 2) {
    return {
      version: 1,
      source: 'assistant_campaign_wizard',
      flowMode: 'quick_send',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
      productIds: matchedIds,
      productName: null,
      productDescription: null,
      topicText: null,
      contentLocale: null,
    };
  }
  if (matchedIds.length === 1) {
    return {
      version: 1,
      source: 'assistant_campaign_wizard',
      flowMode: 'quick_send',
      contentMode: 'single_product',
      productMode: 'catalog',
      productIds: matchedIds,
      productName: null,
      productDescription: null,
      topicText: null,
      contentLocale: null,
    };
  }

  if (EXPLICIT_MULTI_PRODUCT_RE.test(raw) && (Array.isArray(courses) ? courses.length : 0) >= 2) {
    return {
      version: 1,
      source: 'assistant_campaign_wizard',
      flowMode: 'quick_send',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
      productIds: [],
      productName: null,
      productDescription: null,
      topicText: null,
      contentLocale: null,
    };
  }

  if (NON_PRODUCT_PURPOSE_RE.test(raw)) {
    return {
      version: 1,
      source: 'assistant_campaign_wizard',
      flowMode: 'quick_send',
      contentMode: 'context',
      productMode: 'context',
      productIds: [],
      productName: null,
      productDescription: null,
      topicText: null,
      contentLocale: null,
    };
  }

  return null;
}

/** True when payload looks like a campaign script FE can prepare/create. */
export function isCampaignScriptShaped(data) {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray(data.nodes) && Array.isArray(data.connections);
}
