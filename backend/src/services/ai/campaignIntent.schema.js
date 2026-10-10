import { normalizeChannel } from './aiCampaignWizard.service.js';
import { isAdapterCampaignChannel, isAdapterCampaignChannelEnabled, isChannelBlockedByPlan } from '../campaign/campaignChannelFlags.util.js';
import { MAX_CHANNEL_STEPS, countDripSteps } from '../../utils/channelSteps.util.js';
import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';

/**
 * Schema OpenAPI subset cho CampaignIntentV1, tương thích trực tiếp với responseSchema của Gemini.
 */
export const CAMPAIGN_INTENT_V1_SCHEMA = {
  type: 'object',
  properties: {
    // KHÔNG thêm `enum` vào trường số. Gemini chỉ nhận enum gồm chuỗi; gặp
    // `enum: [1]` nó từ chối NGUYÊN schema với lỗi 400 chứ không bỏ qua trường
    // này — làm chết cả lệnh gọi. Lỗi đó tồn tại từ GĐ 1 (7d49f4f4) khiến
    // IntentShadow chưa từng chạy thành công lần nào. Ràng buộc version === 1
    // đã được validateCampaignIntent kiểm ở dưới, đúng chỗ hơn.
    version: { type: 'integer' },
    channel: { type: 'string', enum: ['email', 'zalo', 'zalo_group', 'telegram', 'whatsapp'] },
    sender: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['email_account', 'zalo_account', 'telegram_account', 'whatsapp_session'] },
        id: { type: 'integer' },
        // WhatsApp: tài khoản là MÃ PHIÊN chuỗi ("<idChủ>-<tênPhiên>"), không có id số.
        sessionKey: { type: 'string' },
      },
    },
    audience: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sheet', 'db', 'landing', 'form', 'manual', 'zalo_contacts', 'conversations'] },
        url: { type: 'string' },
        slugs: { type: 'array', items: { type: 'string' } },
        formId: { type: 'integer' },
        groupIds: { type: 'array', items: { type: 'string' } },
        friendIds: { type: 'array', items: { type: 'string' } },
        recipientKind: { type: 'string', enum: ['email', 'phone'] },
      },
    },
    schedule: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['once', 'drip'] },
        days: { type: 'integer' },
        slotsPerDay: { type: 'integer' },
      },
    },
    contentBrief: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['create', 'select'] },
        topic: { type: 'string' },
        productIds: { type: 'array', items: { type: 'integer' } },
        locale: { type: 'string', enum: ['vi', 'en'] },
        tone: { type: 'string' },
        // Trường của CampaignBrief thật mà `deriveIntent` ánh xạ sang (xem chú thích ở đó).
        contentMode: { type: 'string' },
        productName: { type: 'string' },
        productDescription: { type: 'string' },
      },
    },
    fileUsage: {
      type: 'string',
      enum: ['as_content', 'as_attachment', 'both'],
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          size: { type: 'integer' },
          contentType: { type: 'string' },
        },
      },
    },
  },
  required: ['version', 'channel'],
};

const VALID_CHANNELS = new Set(['email', 'zalo', 'zalo_group', 'telegram', 'whatsapp']);
const VALID_SENDER_TYPES = new Set(['email_account', 'zalo_account', 'telegram_account', 'whatsapp_session']);
const VALID_AUDIENCE_TYPES = new Set(['sheet', 'db', 'landing', 'form', 'manual', 'zalo_contacts', 'conversations']);
// P8a — nguồn người nhận compiler dựng được cho kênh adapter. Telegram không gửi được cho người lạ
// (chỉ hội thoại đang mở); WhatsApp thêm các nguồn node dữ liệu (cột SĐT). 'manual' KHÔNG có (danh sách nhập
// tay đi qua lớp phủ directRecipients của Email/Zalo — chưa nối cho Telegram/WhatsApp).
const ADAPTER_AUDIENCE_TYPES = {
  telegram: new Set(['conversations']),
  whatsapp: new Set(['conversations', 'sheet', 'db', 'landing', 'form']),
};
const ADAPTER_SENDER_TYPE = { telegram: 'telegram_account', whatsapp: 'whatsapp_session' };
const VALID_RECIPIENT_KINDS = new Set(['email', 'phone']);
const VALID_SCHEDULE_TYPES = new Set(['once', 'drip']);
const VALID_LOCALES = new Set(['vi', 'en']);
const VALID_FILE_USAGES = new Set(['as_content', 'as_attachment', 'both']);

/**
 * Validator viết tay ~40 dòng cho CampaignIntentV1. Không phụ thuộc thư viện bên ngoài.
 * @param {any} intent
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCampaignIntentV1(intent) {
  const errors = [];
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return { valid: false, errors: ['Intent phải là một object'] };
  }

  if (intent.version !== 1) {
    errors.push('version phải bằng 1');
  }

  if (!VALID_CHANNELS.has(intent.channel)) {
    errors.push(`channel không hợp lệ: "${intent.channel}" (cho phép: email, zalo, zalo_group, telegram, whatsapp)`);
  }

  if (intent.sender != null) {
    if (typeof intent.sender !== 'object' || Array.isArray(intent.sender)) {
      errors.push('sender phải là object');
    } else {
      if (intent.sender.type && !VALID_SENDER_TYPES.has(intent.sender.type)) {
        errors.push(`sender.type không hợp lệ: "${intent.sender.type}"`);
      }
      if (intent.sender.id != null && !Number.isInteger(Number(intent.sender.id))) {
        errors.push('sender.id phải là số nguyên');
      }
    }
  }

  if (intent.audience != null) {
    if (typeof intent.audience !== 'object' || Array.isArray(intent.audience)) {
      errors.push('audience phải là object');
    } else {
      if (intent.audience.type && !VALID_AUDIENCE_TYPES.has(intent.audience.type)) {
        errors.push(`audience.type không hợp lệ: "${intent.audience.type}"`);
      }
      if (intent.audience.recipientKind && !VALID_RECIPIENT_KINDS.has(intent.audience.recipientKind)) {
        errors.push(`audience.recipientKind không hợp lệ: "${intent.audience.recipientKind}"`);
      }
    }
  }

  if (intent.schedule != null) {
    if (typeof intent.schedule !== 'object' || Array.isArray(intent.schedule)) {
      errors.push('schedule phải là object');
    } else {
      if (intent.schedule.type && !VALID_SCHEDULE_TYPES.has(intent.schedule.type)) {
        errors.push(`schedule.type không hợp lệ: "${intent.schedule.type}"`);
      }
    }
  }

  if (intent.contentBrief != null) {
    if (typeof intent.contentBrief !== 'object' || Array.isArray(intent.contentBrief)) {
      errors.push('contentBrief phải là object');
    } else {
      if (intent.contentBrief.locale && !VALID_LOCALES.has(intent.contentBrief.locale)) {
        errors.push(`contentBrief.locale không hợp lệ: "${intent.contentBrief.locale}"`);
      }
    }
  }

  if (intent.fileUsage != null && !VALID_FILE_USAGES.has(intent.fileUsage)) {
    errors.push(`fileUsage không hợp lệ: "${intent.fileUsage}" (cho phép: as_content, as_attachment, both)`);
  }

  if (intent.attachments != null && !Array.isArray(intent.attachments)) {
    errors.push('attachments phải là array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Trích xuất CampaignIntentV1 từ wizard gates. Hàm thuần, đồng bộ, không I/O.
 * Tách biệt hoàn toàn phần nghiệp vụ (channel, sender, audience, schedule, brief)
 * khỏi các cờ điều khiển UI (planApproved, hasContentPlan, sheetCheck, etc.).
 *
 * @param {object} gates
 * @param {object} [brief]
 * @param {object} [options]
 * @returns {{ intent: object, missing: string[] }}
 */
export function deriveIntent(gates = {}, brief = null, options = {}) {
  const missing = [];

  const rawChannel = gates?.channel;
  const channel = rawChannel ? normalizeChannel(rawChannel) : null;
  if (!channel) {
    missing.push('channel');
  }

  // Sender
  let sender = null;
  if (gates?.senderAccountId != null) {
    if (channel === 'whatsapp') {
      // WhatsApp: mã phiên chuỗi, KHÔNG ép Number (Number('12-abc') = NaN).
      sender = { type: 'whatsapp_session', sessionKey: String(gates.senderAccountId) };
    } else {
      sender = {
        type: channel === 'email'
          ? 'email_account'
          : channel === 'telegram' ? 'telegram_account' : 'zalo_account',
        id: Number(gates.senderAccountId),
      };
    }
  }

  // Audience
  let audience = null;
  if (isAdapterCampaignChannel(channel) && !gates?.dataSource && !gates?.sheetUrl) {
    // Kênh adapter: wizard không hỏi nguồn người nhận — mặc định "những người đã nhắn tới tài khoản này".
    audience = { type: 'conversations', ...(channel === 'whatsapp' ? { recipientKind: 'phone' } : {}) };
  } else if (
    gates?.dataSource ||
    gates?.sheetUrl ||
    (Array.isArray(gates?.zaloGroupIds) && gates.zaloGroupIds.length > 0) ||
    (Array.isArray(gates?.zaloFriendIds) && gates.zaloFriendIds.length > 0)
  ) {
    let audType = gates?.dataSource || (channel === 'zalo_group' ? 'zalo_contacts' : null);
    if (audType === 'zalo_friends' || audType === 'zalo_groups') {
      audType = 'zalo_contacts';
    }
    const recipientKind = channel === 'email' ? 'email' : 'phone';
    audience = {
      ...(audType ? { type: audType } : {}),
      recipientKind,
      ...(gates?.sheetUrl ? { url: gates.sheetUrl } : {}),
      // Khách đã ĐÍNH KÈM tệp bảng tính nhưng không có link: intent chưa có đường dữ liệu tất định cho tệp (đường duy nhất là FE đọc tệp
      // rồi đổi nguồn sang 'manual' + directRecipients). Cờ này CHỈ để isCompilableIntent nói rõ lý do — không phải loại audience mới.
      ...(audType === 'sheet' && !gates?.sheetUrl && gates?.hasAttachedSpreadsheet === true
        ? { attachedSpreadsheet: true }
        : {}),
      ...(Array.isArray(gates?.zaloGroupIds) && gates.zaloGroupIds.length > 0
        ? { groupIds: gates.zaloGroupIds }
        : {}),
      ...(Array.isArray(gates?.zaloFriendIds) && gates.zaloFriendIds.length > 0
        ? { friendIds: gates.zaloFriendIds }
        : {}),
      // Rà soát C P2-7 — landing người dùng ĐÃ CHỌN ở cổng `landingLeads`. `allLandings: true` là lựa chọn TƯỜNG MINH "Tất cả landing"
      // (slugs rỗng có chủ ý) — khác với slugs rỗng vì chưa chọn, vốn là khuyết (isCompilableIntent đòi một trong hai).
      ...(audType === 'landing' && Array.isArray(gates?.landingLeadsSlugs) && gates.landingLeadsSlugs.length > 0
        ? { slugs: [...gates.landingLeadsSlugs] }
        : {}),
      ...(audType === 'landing'
        && gates?.landingLeadsAll === true
        && !(Array.isArray(gates?.landingLeadsSlugs) && gates.landingLeadsSlugs.length > 0)
        ? { slugs: [], allLandings: true }
        : {}),
      // Biểu mẫu người dùng ĐÃ CHỌN ở cổng `formId` (nguồn "Người điền Biểu mẫu"). Chỉ nhận số nguyên dương — id rác thì để khuyết
      // (isCompilableIntent báo thiếu audience.formId, giữ đường model thuần) thay vì bịa một id.
      ...(audType === 'form' && Number.isInteger(Number(gates?.formId)) && Number(gates.formId) > 0
        ? { formId: Number(gates.formId) }
        : {}),
    };
  }

  // Schedule
  let schedule = null;
  if (gates?.schedule) {
    const s = gates.schedule;
    const type = s.mode === 'drip' ? 'drip' : s.mode === 'once' ? 'once' : s.days ? 'drip' : 'once';
    schedule = {
      type,
      ...(Number.isFinite(Number(s.days)) && Number(s.days) > 0 ? { days: Number(s.days) } : {}),
      ...(Number.isFinite(Number(s.slotsPerDay)) && Number(s.slotsPerDay) > 0
        ? { slotsPerDay: Number(s.slotsPerDay) }
        : {}),
    };
  }

  // Content brief.
  //
  // CampaignBrief THẬT (campaignBrief.service.js `createEmptyCampaignBrief`) đặt tên trường là
  // `topicText` / `contentLocale` / `contentMode` / `productName` / `productDescription`. Bản cũ chỉ đọc
  // `brief.topic` / `brief.locale` / `brief.mode` nên với brief thật cho ra `contentBrief = undefined` —
  // bước slot filling Zalo nhóm không thấy chủ đề lẫn sản phẩm khách đã nhập và bịa tin "chiến dịch đặc
  // biệt, ưu đãi đặc quyền" (9 chiến dịch, 23 tin thật gửi 20–26/09/2026). Giữ cả tên cũ (`topic`/`locale`/
  // `mode`/`tone`) để các nơi dựng brief bằng tay (test, shadow compare) vẫn chạy.
  const pickString = (...candidates) => {
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  let contentBrief = null;
  if (brief && typeof brief === 'object') {
    const topic = pickString(brief.topic, brief.topicText, brief.productName);
    const locale = pickString(brief.locale, brief.contentLocale);
    const productName = pickString(brief.productName);
    const productDescription = pickString(brief.productDescription);
    const contentMode = pickString(brief.contentMode);
    contentBrief = {
      ...(topic ? { topic } : {}),
      ...(locale ? { locale } : {}),
      ...(Array.isArray(brief.productIds) && brief.productIds.length > 0
        ? { productIds: brief.productIds }
        : {}),
      ...(brief.mode ? { mode: brief.mode } : {}),
      ...(brief.tone ? { tone: brief.tone } : {}),
      ...(contentMode ? { contentMode } : {}),
      ...(productName ? { productName } : {}),
      ...(productDescription ? { productDescription } : {}),
    };
  }

  // File usage & attachments (Việc 2 - PLAN_GUI_KEM_TEP)
  const fileUsage = gates?.fileUsage || options?.fileUsage || null;
  const rawFiles = Array.isArray(options?.files)
    ? options.files
    : (Array.isArray(gates?.files) ? gates.files : []);

  const attachments = rawFiles
    .map((f) => ({
      key: f?.key || f?.storageKey || f?.url || f?.link || f?.attachmentUrl || '',
      name: f?.name || f?.filename || f?.originalName || '',
      size: Number(f?.size) || 0,
      contentType: f?.contentType || f?.mimeType || '',
    }))
    .filter((f) => Boolean(f.key));

  const intent = {
    version: 1,
    ...(channel ? { channel } : {}),
    ...(sender ? { sender } : {}),
    ...(audience ? { audience } : {}),
    ...(schedule ? { schedule } : {}),
    ...(contentBrief && Object.keys(contentBrief).length > 0 ? { contentBrief } : {}),
    ...(fileUsage ? { fileUsage } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  return { intent, missing };
}

// Compiler LUÔN dựng node `interested_customers` với loại "both" + giới hạn 1000 (campaignCompiler.service.js) vì
// CampaignIntentV1 chưa có chỗ chứa bộ lọc người nhận (audience.filters).
const COMPILER_DEFAULT_INTERESTED_LIMIT = 1000;
const LEGACY_DB_AUDIENCE_SUBTYPES = new Set(['interested_customers', 'read_interested_customers']);

/**
 * Script LLM (graph cũ) có đặt BỘ LỌC NGƯỜI NHẬN mà compiler không biểu diễn được không?
 *
 * Với nguồn "khách trong DB", prompt dạy LLM đặt `interestedCourseIds` ("đã mua/quan tâm khoá X"), `notPurchasedCourseIds`
 * ("nhưng chưa mua khoá Y"), `interestedCustomerType` ("purchased"/"interested") và `interestedLimit` khi người dùng yêu cầu.
 * Compiler dựng lại node đó mà KHÔNG có các trường này → "đã mua khoá A mà chưa mua khoá B" thành "mọi khách có email
 * (≤1000)", và thẻ xác nhận chỉ ghi "Lấy dữ liệu khách hàng" (rà soát C P1-3, 03/10/2026). Bộ lọc là việc của wizard/LLM
 * chứ compiler chưa sở hữu, nên khi có bộ lọc thì GIỮ script LLM — đây là đường an toàn như trước khi có compiler.
 *
 * Đưa bộ lọc vào intent (kiểm id thuộc `courses` của chủ) rồi cho compiler chép sang là bước sau, chưa làm.
 *
 * @param {{ nodes?: object[] }|null|undefined} script
 * @returns {{ hasFilters: boolean, reasons: string[] }}
 */
export function detectLegacyAudienceFilters(script) {
  const nodes = Array.isArray(script?.nodes) ? script.nodes : [];
  const nonEmptyList = (value) => Array.isArray(value)
    && value.some((item) => item != null && String(item).trim() !== '');
  const reasons = new Set();

  for (const node of nodes) {
    if (!LEGACY_DB_AUDIENCE_SUBTYPES.has(getNodeSubtype(node))) continue;
    const config = node?.config || node?.nodeConfig || {};

    if (nonEmptyList(config.interestedCourseIds)) reasons.add('interestedCourseIds');
    if (nonEmptyList(config.notPurchasedCourseIds)) reasons.add('notPurchasedCourseIds');

    const customerType = String(config.interestedCustomerType ?? '').trim().toLowerCase();
    if (customerType && customerType !== 'both') reasons.add('interestedCustomerType');

    const hasLimit = config.interestedLimit != null && String(config.interestedLimit).trim() !== '';
    if (hasLimit && Number.isFinite(Number(config.interestedLimit))
      && Number(config.interestedLimit) !== COMPILER_DEFAULT_INTERESTED_LIMIT) {
      reasons.add('interestedLimit');
    }
  }

  return { hasFilters: reasons.size > 0, reasons: [...reasons] };
}

/**
 * Vị từ nghiêm ngặt kiểm tra xem một intent đã đủ mọi dữ liệu cần thiết để compiler dựng graph chưa.
 * Khác với validator/schema (cho phép intent khuyết trong lúc hội thoại đang diễn ra),
 * compiler bắt buộc phải có đủ channel, sender hợp lệ, audience cụ thể và schedule.
 *
 * @param {any} intent
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function isCompilableIntent(intent) {
  const missing = [];
  // Lý do đọc được cho vài trường khuyết (chỉ để log/chẩn đoán). Chỉ xuất hiện trong kết quả khi có phần tử, nên kết quả ok vẫn là { ok, missing }.
  const reasons = {};
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return { ok: false, missing: ['intent'] };
  }

  if (intent.version !== 1) {
    missing.push('version');
  }

  const isAdapterChannel = isAdapterCampaignChannel(intent.channel);
  if (!intent.channel || !VALID_CHANNELS.has(intent.channel)
    // Kênh adapter chỉ biên dịch được khi cờ kênh bật (đọc lúc gọi) — tắt cờ thì như kênh không tồn tại.
    || (isAdapterChannel && !isAdapterCampaignChannelEnabled(intent.channel))
    // P12 — gói không có kênh Zalo: intent Zalo (cá nhân/nhóm) không biên dịch được (đọc lúc gọi, theo người đang chat).
    || ((intent.channel === 'zalo' || intent.channel === 'zalo_group') && isChannelBlockedByPlan('zalo'))) {
    missing.push('channel');
  }

  if (!intent.sender || typeof intent.sender !== 'object' || Array.isArray(intent.sender)) {
    missing.push('sender');
  } else if (intent.channel === 'whatsapp') {
    // WhatsApp không có id số: bắt buộc mã phiên chuỗi hợp lệ.
    if (!/^\d+-[A-Za-z0-9_-]{1,128}$/.test(String(intent.sender.sessionKey ?? '').trim())) {
      missing.push('sender.sessionKey');
    }
    if (intent.sender.type !== 'whatsapp_session') {
      missing.push('sender.type');
    }
  } else {
    if (intent.sender.id == null || !Number.isInteger(Number(intent.sender.id))) {
      missing.push('sender.id');
    }
    if (!intent.sender.type || !VALID_SENDER_TYPES.has(intent.sender.type)
      || (isAdapterChannel && intent.sender.type !== ADAPTER_SENDER_TYPE[intent.channel])) {
      missing.push('sender.type');
    }
  }

  if (!intent.audience || typeof intent.audience !== 'object' || Array.isArray(intent.audience)) {
    missing.push('audience');
  } else {
    if (!intent.audience.type || !VALID_AUDIENCE_TYPES.has(intent.audience.type)
      || (isAdapterChannel && !ADAPTER_AUDIENCE_TYPES[intent.channel]?.has(intent.audience.type))
      // 'conversations' chỉ có nghĩa với kênh adapter (Email/Zalo không có "hội thoại đang mở" làm nguồn).
      || (!isAdapterChannel && intent.audience.type === 'conversations')) {
      missing.push('audience.type');
    } else {
      if (intent.audience.type === 'sheet' && (!intent.audience.url || !String(intent.audience.url).trim())) {
        missing.push('audience.url');
        reasons['audience.url'] = intent.audience.attachedSpreadsheet === true
          ? 'nguồn là bảng tính ĐÍNH KÈM nhưng không có link Google Sheet — compiler không đọc được tệp đính kèm (chưa có đường dữ liệu tất định), giữ script LLM'
          : 'nguồn Google Sheet nhưng chưa có link';
      }
      if (
        intent.audience.type === 'landing'
        && intent.audience.allLandings !== true
        && (!Array.isArray(intent.audience.slugs) || intent.audience.slugs.length === 0)
      ) {
        missing.push('audience.slugs');
      }
      if (intent.audience.type === 'form' && (intent.audience.formId == null || !Number.isInteger(Number(intent.audience.formId)))) {
        missing.push('audience.formId');
      }
    }
  }

  if (!intent.schedule || typeof intent.schedule !== 'object' || Array.isArray(intent.schedule)) {
    missing.push('schedule');
  } else {
    if (!intent.schedule.type || !VALID_SCHEDULE_TYPES.has(intent.schedule.type)) {
      missing.push('schedule.type');
    } else if (intent.schedule.type === 'drip') {
      if (!intent.schedule.days || Number(intent.schedule.days) <= 0) {
        missing.push('schedule.days');
      } else if (isAdapterChannel && countDripSteps(intent.schedule) > MAX_CHANNEL_STEPS) {
        // P7 — kênh adapter chạy được chuỗi drip (nhiều bước hẹn giờ) nhưng node chỉ chứa tối đa MAX_CHANNEL_STEPS bước:
        // số ngày × số tin/ngày vượt trần thì hỏi lại thay vì cắt bớt tin im lặng.
        missing.push('schedule.days');
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    ...(Object.keys(reasons).length > 0 ? { reasons } : {}),
  };
}

