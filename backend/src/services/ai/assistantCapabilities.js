const SUPPORTED_LOCALES = new Set(['en', 'vi']);

function normalizeLocale(locale) {
  const lang = String(locale || 'vi').trim().toLowerCase();
  return SUPPORTED_LOCALES.has(lang) ? lang : 'vi';
}

const CHATBOT_CAPABLE_CHANNEL_RE = /whatsapp|telegram|(?:facebook\s+)?messenger/i;
const SEND_CONTEXT_RE = /gửi|gui|chiến dịch|chien dich|campaign|\bsend\b|broadcast|hàng loạt|hang loat/i;
const CHATBOT_CONTEXT_RE = /chatbot|chat\s*bot|\bbot\b|trả lời|tra loi|\breply\b|\banswer\b/i;

// PR-1 (PLAN_VA_TRO_LY_AI_2026-09-28) — mỗi năng lực khai `patterns` (regex dùng để khớp VÀ để xoá
// khỏi câu khi kiểm "phần còn lại", xem classifyCapabilityProbe). `matches` mặc định = khớp bất kỳ
// pattern nào; năng lực nào cần logic riêng (unsupported_channel, edit_existing) tự khai `matches`.
function matchesAnyPattern(patterns) {
  return (text) => patterns.some((pattern) => pattern.test(text));
}

// guide:edit_existing — câu BÁO SỰ CỐ ("chiến dịch của tôi bị dừng, có phải hết hạn mức không")
// không phải hỏi "sửa/xoá/dừng được không" — không được rơi vào câu kịch bản "Mình chưa sửa trực
// tiếp...". Quy tắc phần-còn-lại (dưới) đã loại được ca này qua "hết hạn mức" còn sót lại, đây là
// chốt thứ hai (giữ cả hai, không thay thế nhau).
const INCIDENT_REPORT_RE = /bị|lỗi|không chạy|không gửi|tại sao|vì sao|sao lại|hết hạn mức|treo|đơ|failed|stuck|error/i;

const CAPABILITY_DEFINITIONS = {
  core: [
    // Xét TRƯỚC campaign: câu về template/mẫu email không được rơi vào "tạo chiến dịch đa kênh"
    // (trước 28/09 "email" trần trong regex campaign + campaign xét trước template làm mọi câu về
    // mẫu email bị nhận nhầm thành hỏi về chiến dịch).
    {
      id: 'template',
      label: {
        vi: 'soạn template Email và tin nhắn Zalo',
        en: 'draft Email and Zalo message templates',
      },
      patterns: [/template|mẫu (?:email|tin nhắn)|mau (?:email|tin nhan)|email (?:mẫu|mau|template)|zalo (?:mẫu|mau|template)/i],
    },
    {
      id: 'campaign',
      label: {
        vi: 'tạo chiến dịch đa kênh qua Email và Zalo',
        en: 'create multi-channel Email and Zalo campaigns',
      },
      // 28/09: bỏ chữ trần "email"/"zalo" (khớp cả câu không liên quan tới chiến dịch, vd "template
      // email có chèn ảnh được không"); thêm "hàng loạt"/"broadcast"/"bulk" — cùng nghĩa "gửi tin
      // hàng loạt" mà trước đây bị bỏ sót.
      patterns: [/chiến dịch|chien dich|campaign|gửi tin|gui tin|send (?:an? )?(?:email|message|campaign)|hàng loạt|hang loat|broadcast|bulk/i],
    },
    {
      id: 'landing_page',
      label: {
        vi: 'tạo landing page',
        en: 'create landing pages',
      },
      patterns: [/landing\s*page|landingpage|\blanding\b|trang\s*đích|trang\s*dich|trang\s*web|website|\bweb\s*page\b/i],
    },
    {
      id: 'draft_revision',
      label: {
        vi: 'điều chỉnh bản nháp hoặc kế hoạch trong lúc chat',
        en: 'revise drafts or plans during the chat',
      },
      patterns: [/bản nháp|ban nhap|kế hoạch|ke hoach|content plan|draft (?:or )?plan|revise (?:a )?draft/i],
    },
    {
      id: 'run_now',
      label: {
        vi: 'tạo và chạy chiến dịch ngay',
        en: 'create and run a campaign immediately',
      },
      patterns: [/chạy ngay|chay ngay|tạo và chạy|tao va chay|create and run|run (?:a )?campaign now/i],
    },
    {
      id: 'attachment_analysis',
      label: {
        vi: 'đọc và phân tích tệp đính kèm',
        en: 'read and analyze attached files',
      },
      patterns: [/(?:đọc|doc|phân tích|phan tich|analy[sz]e|read).*(?:tệp|tep|file|excel|csv|pdf|ảnh|anh|image)|(?:tệp|tep|file|excel|csv|pdf|ảnh|anh|image).*(?:đọc|doc|phân tích|phan tich|analy[sz]e|read)/i],
    },
  ],
  guide: [
    {
      id: 'schedule',
      label: {
        vi: 'lên lịch hoặc hẹn giờ gửi',
        en: 'schedule a campaign',
      },
      patterns: [/lên lịch|len lich|hẹn giờ|hen gio|schedule|scheduling|scheduled/i],
    },
    {
      id: 'edit_existing',
      label: {
        vi: 'sửa, xóa hoặc dừng chiến dịch đã lưu',
        en: 'edit, delete, or stop an existing campaign',
      },
      patterns: [/(?:sửa|sua|xóa|xoa|dừng|dung|stop|delete|edit|pause).*(?:chiến dịch|chien dich|campaign)|(?:chiến dịch|chien dich|campaign).*(?:sửa|sua|xóa|xoa|dừng|dung|stop|delete|edit|pause)/i],
      matches(text) {
        return this.patterns[0].test(text) && !INCIDENT_REPORT_RE.test(text);
      },
    },
  ],
  unsupported: [
    {
      id: 'unsupported_channel',
      // Mục này nói về kênh GỬI CHIẾN DỊCH (chỉ có Email và Zalo). WhatsApp, Telegram, Messenger thì
      // chatbot VẪN nối được (tab Triển khai của Tạo AI Chatbot) — trước 21/09/2026 regex khớp trần
      // tên kênh, nên hỏi "chatbot có nối Telegram được không" bị trả câu cố định "chưa hỗ trợ". Ba
      // kênh đó giờ chỉ tính là không hỗ trợ khi câu hỏi nói về GỬI/chiến dịch và KHÔNG nói về
      // chatbot; còn lại để bộ định tuyến + bài hướng dẫn trả lời. SMS và push thì không có ở đâu cả.
      label: {
        vi: 'gửi chiến dịch qua SMS, WhatsApp, Telegram, Messenger hoặc Push notification',
        en: 'sending campaigns via SMS, WhatsApp, Telegram, Messenger, or push notifications',
      },
      patterns: [/\bsms\b|push notification/i, CHATBOT_CAPABLE_CHANNEL_RE],
      matches: (text) => /\bsms\b|push notification/i.test(text)
        || (CHATBOT_CAPABLE_CHANNEL_RE.test(text) && SEND_CONTEXT_RE.test(text) && !CHATBOT_CONTEXT_RE.test(text)),
    },
    {
      id: 'ab_testing',
      label: {
        vi: 'A/B testing',
        en: 'A/B testing',
      },
      // Thêm hậu tố "test(ing)" tuỳ chọn để phần-còn-lại (dưới) xoá luôn chữ "test" trong "có A/B
      // test không" — trước đây chỉ xoá "A/B", để sót "test" làm câu này (vốn PHẢI vẫn là probe)
      // bị coi nhầm là có nội dung khác.
      patterns: [/a\s*\/\s*b(?:\s*test(?:ing)?)?|ab testing|split test/i],
    },
    {
      id: 'conditional_logic',
      label: {
        vi: 'logic điều kiện if/else',
        en: 'if/else conditional logic',
      },
      patterns: [/if\s*\/\s*else|if\s+else|logic điều kiện|logic dieu kien|conditional logic/i],
    },
    {
      id: 'behavioral_personalization',
      label: {
        vi: 'cá nhân hóa theo hành vi',
        en: 'behavioral personalization',
      },
      patterns: [/cá nhân hóa theo hành vi|ca nhan hoa theo hanh vi|behavior(?:al)? personalization/i],
    },
  ],
};

for (const capabilities of Object.values(CAPABILITY_DEFINITIONS)) {
  for (const capability of capabilities) {
    if (!capability.matches) capability.matches = matchesAnyPattern(capability.patterns);
  }
}

function localizedCapabilities(kind, locale) {
  const lang = normalizeLocale(locale);
  return CAPABILITY_DEFINITIONS[kind].map(({ id, label }) => ({ id, label: label[lang] }));
}

export const CORE_CAPABILITIES = Object.freeze({
  vi: Object.freeze(localizedCapabilities('core', 'vi')),
  en: Object.freeze(localizedCapabilities('core', 'en')),
});

export const GUIDE_ONLY = Object.freeze({
  vi: Object.freeze(localizedCapabilities('guide', 'vi')),
  en: Object.freeze(localizedCapabilities('guide', 'en')),
});

export const KNOWN_UNSUPPORTED = Object.freeze({
  vi: Object.freeze(localizedCapabilities('unsupported', 'vi')),
  en: Object.freeze(localizedCapabilities('unsupported', 'en')),
});

const HOW_TO_RE = /làm sao|lam sao|làm thế nào|lam the nao|như thế nào|nhu the nao|hướng dẫn|huong dan|\bcách\b|\bcach\b|how\s+(?:to|do|can\s+i)\b/i;
const CAPABILITY_MARKER_RE = /có thể|co the|được không|duoc khong|được chứ|duoc chu|(?:^|[\s,;:])có\s+[\s\S]{0,120}\s+không(?:[?!.,;:]|\s|$)|(?:^|[\s,;:])co\s+[\s\S]{0,120}\s+khong(?:[?!.,;:]|\s|$)|hỗ trợ[\s\S]{0,120}(?:không|chứ)|ho tro[\s\S]{0,120}(?:khong|chu)|\bcan\s+(?:you|it|i)\b|\bdo(?:es)?\s+(?:the\s+system|you|it)\s+support\b|\bis\s+[\s\S]{0,120}\bsupported\b|\bis\s+it\s+possible\b/i;

// PR-1 (PLAN_VA_TRO_LY_AI_2026-09-28) — từ đệm bỏ đi khi kiểm "phần còn lại" của câu (Việc 1.4).
// KHÔNG xoá đoạn khớp CAPABILITY_MARKER_RE khỏi câu (nhánh "có...không" của nó nuốt cả ruột câu) —
// thay vào đó coi TỪNG TỪ dấu hiệu (có/không/thể/được/chứ/hỗ/trợ/phải) là từ đệm ở đây.
const FILLER_WORDS = new Set([
  // xưng hô/đệm
  'bạn', 'mình', 'tôi', 'em', 'anh', 'chị', 'cho', 'giúp', 'hộ', 'nhé', 'ạ', 'ơi', 'với', 'là', 'của',
  'này', 'đó', 'kia', 'thì', 'mà', 'và', 'hay', 'hoặc', 'qua', 'bằng', 'về', 'ở', 'trên', 'cả', 'luôn',
  'ngay', 'rất', 'hơi', 'à', 'ừ',
  // dấu hiệu hỏi năng lực
  'có', 'không', 'khong', 'thể', 'the', 'được', 'duoc', 'chứ', 'chu', 'hỗ', 'trợ', 'ho', 'tro', 'phải',
  // động từ "làm hộ" (câu "bạn có thể tạo X không" là probe thuần)
  'tạo', 'tao', 'làm', 'lam', 'soạn', 'soan', 'viết', 'viet', 'thiết', 'kế', 'thiet', 'ke', 'dựng',
  'dung', 'xây', 'xay', 'gửi', 'gui', 'nhắn', 'nhan', 'chạy', 'chay', 'lên', 'len',
  // "sửa" cùng nhóm — battery bắt "sửa chiến dịch đã tạo được không" phải GIỮ guide:edit_existing
  // (campaign xét trước edit_existing trong ALL_CAPABILITY_PATTERNS nên "chiến dịch" bị xoá trước,
  // để lại "sửa" đứng một mình). CỐ Ý không thêm "xóa/dừng/stop/delete/edit/pause" — "dừng" phải
  // CÒN lại để "có thể dừng chiến dịch đang chạy không" tiếp tục ra null (kho bài trả lời được).
  'sửa', 'sua',
  // thì/trạng thái
  'đang', 'đã', 'da', 'rồi', 'roi', 'vẫn', 'van', 'hiện', 'hien', 'mới', 'moi', 'sẽ', 'se', 'giờ', 'gio',
  // chủ ngữ hệ thống
  'hệ', 'thống', 'he', 'thong', 'lý', 'ly', 'phần', 'mềm', 'app', 'ai', 'founder',
  // tên kênh (khi hỏi năng lực, tên kênh không thêm nghĩa)
  'email', 'mail', 'zalo', 'sms',
  // tiếng Anh
  'the', 'you', 'i', 'it', 'me', 'a', 'an', 'and', 'or', 'can', 'could', 'do', 'does', 'is', 'are',
  'please', 'help', 'support', 'supported', 'possible', 'create', 'make', 'build', 'design', 'send',
  'run', 'this', 'that', 'for', 'to', 'of', 'with', 'in', 'on', 'my', 'your',
]);

const ALL_CAPABILITY_PATTERNS = Object.values(CAPABILITY_DEFINITIONS)
  .flat()
  .flatMap((capability) => capability.patterns);

const PUNCTUATION_RE = /[?!.,;:()"']/g;

/**
 * Xoá khỏi câu mọi đoạn khớp `patterns` của TẤT CẢ năng lực (không chỉ năng lực vừa khớp — "chiến
 * dịch có hẹn giờ được không" phải xoá cả "chiến dịch" lẫn "hẹn giờ"), rồi bỏ từ đệm, rồi kiểm còn
 * từ có nghĩa (≥ 3 ký tự) nào không.
 */
function hasMeaningfulRemainder(text) {
  let rest = text;
  for (const pattern of ALL_CAPABILITY_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    rest = rest.replace(globalPattern, ' ');
  }
  const words = rest
    .replace(PUNCTUATION_RE, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER_WORDS.has(word));
  return words.some((word) => word.length >= 3);
}

/**
 * Deterministically identifies product capability questions before the LLM router.
 * Locale affects only the returned label; matching accepts Vietnamese and English.
 *
 * Chỉ trả câu kịch bản khi câu hỏi KHÔNG CÒN gì ngoài chính năng lực đó (xem hasMeaningfulRemainder)
 * — còn từ có nghĩa khác thì để câu đi tiếp bộ định tuyến + RAG (kho bài trả lời đúng chủ đề hơn).
 */
export function classifyCapabilityProbe(question = '', locale = 'vi') {
  const text = String(question || '').trim();
  if (!text || HOW_TO_RE.test(text) || !CAPABILITY_MARKER_RE.test(text)) return null;

  // Keep unsupported answers conservative when a sentence mentions mixed capabilities.
  for (const kind of ['unsupported', 'guide', 'core']) {
    const match = CAPABILITY_DEFINITIONS[kind].find((capability) => capability.matches(text));
    if (match) {
      if (hasMeaningfulRemainder(text)) return null;
      const lang = normalizeLocale(locale);
      return { kind, id: match.id, label: match.label[lang] };
    }
  }

  return null;
}

/**
 * PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) — câu LỆNH gửi qua kênh chưa hỗ trợ ("gửi tin
 * telegram cho khách"), khác classifyCapabilityProbe: không đòi CAPABILITY_MARKER_RE (câu lệnh,
 * không phải câu hỏi năng lực "có...không"). Dùng lại đúng logic khớp của unsupported_channel
 * (`CAPABILITY_DEFINITIONS.unsupported`) — không chép lại regex.
 */
export function classifyUnsupportedSendRequest(question = '', locale = 'vi') {
  const text = String(question || '').trim();
  if (!text || HOW_TO_RE.test(text)) return null;

  const capability = CAPABILITY_DEFINITIONS.unsupported.find((c) => c.id === 'unsupported_channel');
  if (!capability || !capability.matches(text)) return null;

  const lang = normalizeLocale(locale);
  return { kind: 'unsupported', id: capability.id, label: capability.label[lang] };
}

export function formatAssistantCapabilities(locale = 'vi') {
  const lang = normalizeLocale(locale);
  const labels = lang === 'en'
    ? {
      heading: '=== ASSISTANT CAPABILITIES — OUTSIDE THE HELP ARTICLES ===',
      core: 'CAN DO',
      guide: 'GUIDANCE ONLY',
      unsupported: 'NOT SUPPORTED',
    }
    : {
      heading: '=== NĂNG LỰC HÀNH ĐỘNG CỦA TRỢ LÝ — NGOÀI TÀI LIỆU ===',
      core: 'LÀM ĐƯỢC',
      guide: 'CHỈ HƯỚNG DẪN',
      unsupported: 'KHÔNG HỖ TRỢ',
    };

  const lines = [labels.heading];
  for (const [title, capabilities] of [
    [labels.core, CORE_CAPABILITIES[lang]],
    [labels.guide, GUIDE_ONLY[lang]],
    [labels.unsupported, KNOWN_UNSUPPORTED[lang]],
  ]) {
    lines.push(`## ${title}`);
    lines.push(...capabilities.map((capability) => `- ${capability.label}`));
  }
  return lines.join('\n');
}
