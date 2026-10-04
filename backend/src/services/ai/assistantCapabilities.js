import { getChannelsBlockedByPlan, isChannelBlockedByPlan } from '../campaign/campaignChannelFlags.util.js';

const SUPPORTED_LOCALES = new Set(['en', 'vi']);

function normalizeLocale(locale) {
  const lang = String(locale || 'vi').trim().toLowerCase();
  return SUPPORTED_LOCALES.has(lang) ? lang : 'vi';
}

const SEND_CONTEXT_RE = /gửi|gui|chiến dịch|chien dich|campaign|\bsend\b|broadcast|hàng loạt|hang loat/i;
const CHATBOT_CONTEXT_RE = /chatbot|chat\s*bot|\bbot\b|trả lời|tra loi|\breply\b|\banswer\b/i;

// PR-B Việc 1.1 — đọc lúc GỌI, không lúc import (khuôn campaignChannelRegistry.service.js:122-125
// `isTelegramChannelEnabled`) — test đổi cờ giữa các ca không bị dính giá trị cũ.
// P9 — cờ toàn cục VÀ quyền kênh theo gói của người đang chat (`campaignChannelFlags.util`). Vẫn đọc env TẠI ĐÂY
// (spec ghim tên biến env ở cả hai nơi khớp nhau).
function isTelegramCampaignEnabled() {
  return process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED === 'true' && !isChannelBlockedByPlan('telegram');
}

// P8a — WhatsApp đối xứng Telegram: cờ bật thì trợ lý dựng được chiến dịch WhatsApp (node send_whatsapp), kênh này
// rời danh sách "chưa hỗ trợ". Cờ đọc lúc gọi như Telegram.
function isWhatsAppCampaignEnabled() {
  return process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED === 'true' && !isChannelBlockedByPlan('whatsapp');
}

// P9 — kênh có cờ bật nhưng GÓI của người đang chat không có: câu nói về GỬI qua kênh đó không được trả "chưa hỗ trợ"
// (sai — hệ thống hỗ trợ, chỉ là gói chưa có) mà phải hướng tới "mua thêm slot / nâng gói".
const BLOCKED_CHANNEL_PATTERN = Object.freeze({
  telegram: /telegram/i,
  whatsapp: /whats\s?app/i,
  zalo: /zalo/i,
});

// P12 — Zalo là kênh MẶC ĐỊNH của hầu hết câu gửi chiến dịch ("Email và Zalo"): câu còn nhắc Email thì KHÔNG chặn ở đây
// (Zalo bị bỏ khỏi wizard/registry, chiến dịch vẫn dựng được bằng Email; node Zalo lọt vào sẽ bị 400 lúc tạo).
const EMAIL_MENTION_RE = /\bemail\b|\bmail\b|thư điện tử|thu dien tu/i;

function findBlockedChannelInSendRequest(text) {
  if (!SEND_CONTEXT_RE.test(text) || CHATBOT_CONTEXT_RE.test(text)) return null;
  // Kênh adapter có cờ bật mà gói không có + Zalo (không có cờ env — chỉ theo gói).
  const blockedChannels = [...getChannelsBlockedByPlan(), ...(isChannelBlockedByPlan('zalo') ? ['zalo'] : [])];
  return blockedChannels.find((channel) => (
    BLOCKED_CHANNEL_PATTERN[channel].test(text)
    && !(channel === 'zalo' && EMAIL_MENTION_RE.test(text))
  )) || null;
}

function notInPlanResult(channel) {
  const name = { telegram: 'Telegram', whatsapp: 'WhatsApp', zalo: 'Zalo' }[channel] || channel;
  return { kind: 'unsupported', id: 'channel_not_in_plan', channel, label: name };
}

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

// P8a — Telegram/WhatsApp: trợ lý DỰNG ĐƯỢC chiến dịch (node send_telegram / send_whatsapp, tài khoản hỏi lại khi
// thiếu, gửi MỘT tin) và Gửi nhanh có ở trang Gửi nhanh → thuộc "LÀM ĐƯỢC" (core), KHÔNG còn là "chỉ hướng dẫn"
// như trước 30/09 (bản cũ nói "trợ lý chưa dựng hộ, chưa có gửi nhanh" — lỗi thời). Dựng lại mỗi lần gọi để
// phản ánh đúng cờ hiện tại. Xét TRƯỚC năng lực `campaign` chung (câu "gửi chiến dịch qua Telegram" phải ra đúng kênh).
function buildAdapterCampaignCapabilities() {
  const capabilities = [];
  if (isTelegramCampaignEnabled()) {
    capabilities.push({
      id: 'telegram_campaign',
      label: {
        vi: 'gửi chiến dịch qua Telegram (mình hỏi tài khoản Telegram, soạn nội dung rồi gửi một tin hoặc chuỗi tối đa 5 tin cách nhau thời gian; gửi nhanh có ở trang Gửi nhanh)',
        en: 'send Telegram campaigns (I ask which Telegram account to use, draft the message, and send one message or a sequence of up to 5 timed messages; quick send is on the Quick Send page)',
      },
      patterns: [/telegram/i],
      matches: (text) => /telegram/i.test(text)
        && SEND_CONTEXT_RE.test(text)
        && !CHATBOT_CONTEXT_RE.test(text),
    });
  }
  if (isWhatsAppCampaignEnabled()) {
    capabilities.push({
      id: 'whatsapp_campaign',
      label: {
        vi: 'gửi chiến dịch qua WhatsApp (mình hỏi tài khoản WhatsApp, soạn nội dung rồi gửi một tin hoặc chuỗi tối đa 5 tin cách nhau thời gian; gửi nhanh có ở trang Gửi nhanh)',
        en: 'send WhatsApp campaigns (I ask which WhatsApp account to use, draft the message, and send one message or a sequence of up to 5 timed messages; quick send is on the Quick Send page)',
      },
      patterns: [/whats\s?app/i],
      matches: (text) => /whats\s?app/i.test(text)
        && SEND_CONTEXT_RE.test(text)
        && !CHATBOT_CONTEXT_RE.test(text),
    });
  }
  return capabilities;
}

// Flag-độc lập, dựng một lần — schedule/edit_existing không đổi theo cờ Telegram.
const STATIC_GUIDE_CAPABILITIES = [
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
];

// PR-B Việc 1.3 / P8a — kênh không hỗ trợ GỬI CHIẾN DỊCH phụ thuộc cờ Telegram và WhatsApp: dựng lại object mỗi
// lần gọi (label + regex kênh) để luôn phản ánh đúng trạng thái cờ hiện tại, không lúc import.
function buildUnsupportedChannelCapability() {
  const telegramOn = isTelegramCampaignEnabled();
  const whatsappOn = isWhatsAppCampaignEnabled();
  const channelPatterns = [
    ...(whatsappOn ? [] : ['whatsapp']),
    ...(telegramOn ? [] : ['telegram']),
    '(?:facebook\\s+)?messenger',
  ];
  const channelRe = new RegExp(channelPatterns.join('|'), 'i');
  const labelChannels = {
    vi: ['SMS', ...(whatsappOn ? [] : ['WhatsApp']), ...(telegramOn ? [] : ['Telegram']), 'Messenger'],
    en: ['SMS', ...(whatsappOn ? [] : ['WhatsApp']), ...(telegramOn ? [] : ['Telegram']), 'Messenger'],
  };
  const joinVi = (items) => `${items.slice(0, -1).join(', ')} hoặc ${items[items.length - 1]}`;
  const joinEn = (items) => `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
  return {
    id: 'unsupported_channel',
    // Mục này nói về kênh GỬI CHIẾN DỊCH (Email, Zalo, và Telegram/WhatsApp khi cờ bật). Telegram/WhatsApp/Zalo thì
    // chatbot nối được (cột "Đưa chatbot tới khách" của mục Chatbot của tôi; Messenger/Zalo OA đã gỡ khỏi Studio
    // 04/10/2026) — trước 21/09/2026 regex khớp trần tên kênh, nên hỏi "chatbot
    // có nối Telegram được không" bị trả câu cố định "chưa hỗ trợ". Các kênh chatbot-nối-được chỉ tính là không
    // hỗ trợ khi câu hỏi nói về GỬI/chiến dịch và KHÔNG nói về chatbot; còn lại để bộ định tuyến + bài hướng dẫn
    // trả lời. SMS và push không có ở đâu cả.
    label: {
      vi: `gửi chiến dịch qua ${joinVi([...labelChannels.vi, 'Push notification'])}`,
      en: `sending campaigns via ${joinEn([...labelChannels.en, 'push notifications'])}`,
    },
    patterns: [/\bsms\b|push notification/i, channelRe],
    matches: (text) => /\bsms\b|push notification/i.test(text)
      || (channelRe.test(text) && SEND_CONTEXT_RE.test(text) && !CHATBOT_CONTEXT_RE.test(text)),
  };
}

// Flag-độc lập, dựng một lần.
const STATIC_OTHER_UNSUPPORTED_CAPABILITIES = [
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
];

const STATIC_CORE_CAPABILITIES = [
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
        vi: 'tạo và chạy chiến dịch ngay sau khi bạn bấm xác nhận',
        en: 'create and run a campaign right after you confirm it',
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
];

const NO_ZALO_LABELS = {
  template: { vi: 'soạn template Email', en: 'draft Email message templates' },
  campaign: { vi: 'tạo chiến dịch qua Email', en: 'create Email campaigns' },
};

function withoutZaloLabel(capability) {
  const label = NO_ZALO_LABELS[capability.id];
  return label ? { ...capability, label } : capability;
}

const CAPABILITY_DEFINITIONS = {
  // P8a — core/guide/unsupported ĐỌC LÚC GỌI (getter): thành phần phụ thuộc cờ Telegram/WhatsApp
  // (telegram_campaign/whatsapp_campaign có mặt hay không; label + regex kênh của unsupported_channel) phải luôn
  // phản ánh giá trị process.env HIỆN TẠI, không phải giá trị lúc module được import.
  get core() {
    const capabilities = [...buildAdapterCampaignCapabilities(), ...STATIC_CORE_CAPABILITIES];
    // P12 — gói không có kênh Zalo: nhãn "LÀM ĐƯỢC" không được hứa Zalo (giữ nguyên regex/matches, chỉ đổi nhãn).
    return isChannelBlockedByPlan('zalo') ? capabilities.map(withoutZaloLabel) : capabilities;
  },
  get guide() {
    return STATIC_GUIDE_CAPABILITIES;
  },
  get unsupported() {
    return [buildUnsupportedChannelCapability(), ...STATIC_OTHER_UNSUPPORTED_CAPABILITIES];
  },
};

// matches mặc định chỉ cần gán MỘT LẦN cho các định nghĩa TĨNH (core + hai mảng guide/unsupported
// flag-độc lập) — telegram_campaign/whatsapp_campaign và unsupported_channel đã tự khai matches riêng ở trên, và
// được dựng lại mỗi lần gọi nên không có "một lần" nào để gán thêm.
for (const capability of [
  ...STATIC_CORE_CAPABILITIES,
  ...STATIC_GUIDE_CAPABILITIES,
  ...STATIC_OTHER_UNSUPPORTED_CAPABILITIES,
]) {
  if (!capability.matches) capability.matches = matchesAnyPattern(capability.patterns);
}

function localizedCapabilities(kind, locale) {
  const lang = normalizeLocale(locale);
  return CAPABILITY_DEFINITIONS[kind].map(({ id, label }) => ({ id, label: label[lang] }));
}

// P8a — `core` cũng phụ thuộc cờ (năng lực gửi chiến dịch Telegram/WhatsApp): getter như GUIDE_ONLY.
export const CORE_CAPABILITIES = {
  get vi() { return localizedCapabilities('core', 'vi'); },
  get en() { return localizedCapabilities('core', 'en'); },
};

// PR-B — `guide`/`unsupported` phụ thuộc cờ Telegram/WhatsApp: `.vi`/`.en` phải là getter (tính lại lúc
// gọi), không phải giá trị đông cứng lúc import, để phản ánh đúng process.env HIỆN TẠI mỗi lần
// đọc (test đổi cờ giữa các ca; formatAssistantCapabilities gọi lại mỗi lượt chat).
export const GUIDE_ONLY = {
  get vi() { return localizedCapabilities('guide', 'vi'); },
  get en() { return localizedCapabilities('guide', 'en'); },
};

export const KNOWN_UNSUPPORTED = {
  get vi() { return localizedCapabilities('unsupported', 'vi'); },
  get en() { return localizedCapabilities('unsupported', 'en'); },
};

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

// PR-B — hàm, không hằng số: `CAPABILITY_DEFINITIONS.guide`/`.unsupported` là getter đọc cờ Telegram
// lúc gọi; một `const` tính một lần ở module-scope sẽ đông cứng theo cờ lúc IMPORT thay vì lúc gọi.
function getAllCapabilityPatterns() {
  return Object.values(CAPABILITY_DEFINITIONS)
    .flat()
    .flatMap((capability) => capability.patterns);
}

const PUNCTUATION_RE = /[?!.,;:()"']/g;

/**
 * Xoá khỏi câu mọi đoạn khớp `patterns` của TẤT CẢ năng lực (không chỉ năng lực vừa khớp — "chiến
 * dịch có hẹn giờ được không" phải xoá cả "chiến dịch" lẫn "hẹn giờ"), rồi bỏ từ đệm, rồi kiểm còn
 * từ có nghĩa (≥ 3 ký tự) nào không.
 */
function hasMeaningfulRemainder(text) {
  let rest = text;
  for (const pattern of getAllCapabilityPatterns()) {
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

  // P9 — gói không có kênh: nói đúng lý do, xét TRƯỚC (kênh bị coi là tắt nên các nhánh dưới sẽ trả "chưa hỗ trợ").
  const blockedChannel = findBlockedChannelInSendRequest(text);
  if (blockedChannel) return notInPlanResult(blockedChannel);

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
 *
 * PR-B / P8a — cờ kênh (Telegram, WhatsApp) bật thì kênh đó KHÔNG còn nằm trong regex `unsupported_channel`
 * (trợ lý dựng được chiến dịch), nên câu lệnh "gửi tin telegram cho khách" trả null và đi tiếp vào luồng dựng
 * chiến dịch — trước 30/09 nhánh này trả câu hướng dẫn "trợ lý chưa dựng hộ". Cờ tắt → nhánh cũ y nguyên.
 */
export function classifyUnsupportedSendRequest(question = '', locale = 'vi') {
  const text = String(question || '').trim();
  if (!text || HOW_TO_RE.test(text)) return null;

  const lang = normalizeLocale(locale);

  // P9 — như probe: lệnh gửi qua kênh mà gói không có -> báo "mua thêm slot", không phải "chưa hỗ trợ".
  const blockedChannel = findBlockedChannelInSendRequest(text);
  if (blockedChannel) return notInPlanResult(blockedChannel);

  const capability = CAPABILITY_DEFINITIONS.unsupported.find((c) => c.id === 'unsupported_channel');
  if (!capability || !capability.matches(text)) return null;

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
