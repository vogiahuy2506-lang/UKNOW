const SUPPORTED_LOCALES = new Set(['en', 'vi']);

function normalizeLocale(locale) {
  const lang = String(locale || 'vi').trim().toLowerCase();
  return SUPPORTED_LOCALES.has(lang) ? lang : 'vi';
}

const CAPABILITY_DEFINITIONS = {
  core: [
    {
      id: 'campaign',
      label: {
        vi: 'tạo chiến dịch đa kênh qua Email và Zalo',
        en: 'create multi-channel Email and Zalo campaigns',
      },
      matches: (text) => /chiến dịch|chien dich|campaign|\bemail\b|zalo|gửi tin|gui tin|send (?:an? )?(?:email|message|campaign)/i.test(text),
    },
    {
      id: 'landing_page',
      label: {
        vi: 'tạo landing page',
        en: 'create landing pages',
      },
      matches: (text) => /landing\s*page|\blanding\b/i.test(text),
    },
    {
      id: 'template',
      label: {
        vi: 'soạn template Email và tin nhắn Zalo',
        en: 'draft Email and Zalo message templates',
      },
      matches: (text) => /template|mẫu (?:email|tin nhắn)|mau (?:email|tin nhan)|email (?:mẫu|mau|template)|zalo (?:mẫu|mau|template)/i.test(text),
    },
    {
      id: 'draft_revision',
      label: {
        vi: 'điều chỉnh bản nháp hoặc kế hoạch trong lúc chat',
        en: 'revise drafts or plans during the chat',
      },
      matches: (text) => /bản nháp|ban nhap|kế hoạch|ke hoach|content plan|draft (?:or )?plan|revise (?:a )?draft/i.test(text),
    },
    {
      id: 'run_now',
      label: {
        vi: 'tạo và chạy chiến dịch ngay',
        en: 'create and run a campaign immediately',
      },
      matches: (text) => /chạy ngay|chay ngay|tạo và chạy|tao va chay|create and run|run (?:a )?campaign now/i.test(text),
    },
    {
      id: 'attachment_analysis',
      label: {
        vi: 'đọc và phân tích tệp đính kèm',
        en: 'read and analyze attached files',
      },
      matches: (text) => /(?:đọc|doc|phân tích|phan tich|analy[sz]e|read).*(?:tệp|tep|file|excel|csv|pdf|ảnh|anh|image)|(?:tệp|tep|file|excel|csv|pdf|ảnh|anh|image).*(?:đọc|doc|phân tích|phan tich|analy[sz]e|read)/i.test(text),
    },
  ],
  guide: [
    {
      id: 'schedule',
      label: {
        vi: 'lên lịch hoặc hẹn giờ gửi',
        en: 'schedule a campaign',
      },
      matches: (text) => /lên lịch|len lich|hẹn giờ|hen gio|schedule|scheduling|scheduled/i.test(text),
    },
    {
      id: 'edit_existing',
      label: {
        vi: 'sửa, xóa hoặc dừng chiến dịch đã lưu',
        en: 'edit, delete, or stop an existing campaign',
      },
      matches: (text) => /(?:sửa|sua|xóa|xoa|dừng|dung|stop|delete|edit|pause).*(?:chiến dịch|chien dich|campaign)|(?:chiến dịch|chien dich|campaign).*(?:sửa|sua|xóa|xoa|dừng|dung|stop|delete|edit|pause)/i.test(text),
    },
  ],
  unsupported: [
    {
      id: 'unsupported_channel',
      label: {
        vi: 'SMS, WhatsApp, Telegram, Messenger hoặc Push notification',
        en: 'SMS, WhatsApp, Telegram, Messenger, or push notifications',
      },
      matches: (text) => /\bsms\b|whatsapp|telegram|(?:facebook\s+)?messenger|push notification/i.test(text),
    },
    {
      id: 'ab_testing',
      label: {
        vi: 'A/B testing',
        en: 'A/B testing',
      },
      matches: (text) => /a\s*\/\s*b|ab testing|split test/i.test(text),
    },
    {
      id: 'conditional_logic',
      label: {
        vi: 'logic điều kiện if/else',
        en: 'if/else conditional logic',
      },
      matches: (text) => /if\s*\/\s*else|if\s+else|logic điều kiện|logic dieu kien|conditional logic/i.test(text),
    },
    {
      id: 'behavioral_personalization',
      label: {
        vi: 'cá nhân hóa theo hành vi',
        en: 'behavioral personalization',
      },
      matches: (text) => /cá nhân hóa theo hành vi|ca nhan hoa theo hanh vi|behavior(?:al)? personalization/i.test(text),
    },
  ],
};

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

/**
 * Deterministically identifies product capability questions before the LLM router.
 * Locale affects only the returned label; matching accepts Vietnamese and English.
 */
export function classifyCapabilityProbe(question = '', locale = 'vi') {
  const text = String(question || '').trim();
  if (!text || HOW_TO_RE.test(text) || !CAPABILITY_MARKER_RE.test(text)) return null;

  // Keep unsupported answers conservative when a sentence mentions mixed capabilities.
  for (const kind of ['unsupported', 'guide', 'core']) {
    const match = CAPABILITY_DEFINITIONS[kind].find((capability) => capability.matches(text));
    if (match) {
      const lang = normalizeLocale(locale);
      return { kind, id: match.id, label: match.label[lang] };
    }
  }

  return null;
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
