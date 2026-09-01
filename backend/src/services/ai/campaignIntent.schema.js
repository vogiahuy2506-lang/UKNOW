import { normalizeChannel } from './aiCampaignWizard.service.js';

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
    channel: { type: 'string', enum: ['email', 'zalo', 'zalo_group'] },
    sender: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['email_account', 'zalo_account'] },
        id: { type: 'integer' },
      },
    },
    audience: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sheet', 'db', 'landing', 'manual', 'zalo_contacts'] },
        url: { type: 'string' },
        slugs: { type: 'array', items: { type: 'string' } },
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

const VALID_CHANNELS = new Set(['email', 'zalo', 'zalo_group']);
const VALID_SENDER_TYPES = new Set(['email_account', 'zalo_account']);
const VALID_AUDIENCE_TYPES = new Set(['sheet', 'db', 'landing', 'manual', 'zalo_contacts']);
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
    errors.push(`channel không hợp lệ: "${intent.channel}" (cho phép: email, zalo, zalo_group)`);
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
    sender = {
      type: channel === 'email' ? 'email_account' : 'zalo_account',
      id: Number(gates.senderAccountId),
    };
  }

  // Audience
  let audience = null;
  if (
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
      ...(Array.isArray(gates?.zaloGroupIds) && gates.zaloGroupIds.length > 0
        ? { groupIds: gates.zaloGroupIds }
        : {}),
      ...(Array.isArray(gates?.zaloFriendIds) && gates.zaloFriendIds.length > 0
        ? { friendIds: gates.zaloFriendIds }
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

  // Content brief
  let contentBrief = null;
  if (brief && typeof brief === 'object') {
    contentBrief = {
      ...(brief.topic ? { topic: brief.topic } : {}),
      ...(brief.locale ? { locale: brief.locale } : {}),
      ...(Array.isArray(brief.productIds) && brief.productIds.length > 0
        ? { productIds: brief.productIds }
        : {}),
      ...(brief.mode ? { mode: brief.mode } : {}),
      ...(brief.tone ? { tone: brief.tone } : {}),
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
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    return { ok: false, missing: ['intent'] };
  }

  if (intent.version !== 1) {
    missing.push('version');
  }

  if (!intent.channel || !VALID_CHANNELS.has(intent.channel)) {
    missing.push('channel');
  }

  if (!intent.sender || typeof intent.sender !== 'object' || Array.isArray(intent.sender)) {
    missing.push('sender');
  } else {
    if (intent.sender.id == null || !Number.isInteger(Number(intent.sender.id))) {
      missing.push('sender.id');
    }
    if (!intent.sender.type || !VALID_SENDER_TYPES.has(intent.sender.type)) {
      missing.push('sender.type');
    }
  }

  if (!intent.audience || typeof intent.audience !== 'object' || Array.isArray(intent.audience)) {
    missing.push('audience');
  } else {
    if (!intent.audience.type || !VALID_AUDIENCE_TYPES.has(intent.audience.type)) {
      missing.push('audience.type');
    } else {
      if (intent.audience.type === 'sheet' && (!intent.audience.url || !String(intent.audience.url).trim())) {
        missing.push('audience.url');
      }
      if (intent.audience.type === 'landing' && (!Array.isArray(intent.audience.slugs) || intent.audience.slugs.length === 0)) {
        missing.push('audience.slugs');
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
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

