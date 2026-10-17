/**
 * Hàm thuần của trình tạo chiến dịch "Từng bước" (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14, PR-2).
 * Không React, không gọi mạng: trạng thái của trình → body gửi server (hợp đồng PR-1), điều kiện sang bước kế,
 * dọn lựa chọn khi đổi kênh. Tách riêng để test được từng quy tắc mà không phải dựng cả màn hình.
 */

export const SIMPLE_CHANNELS = Object.freeze(['email', 'zalo', 'zalo_group']);

/** Thứ tự bước. PR-3 chỉ thêm thẻ vào bước `when`, không đổi danh sách này. */
export const SIMPLE_STEP_IDS = Object.freeze(['channel', 'audience', 'content', 'when', 'review']);

/**
 * Nguồn người nhận hợp lệ cho từng kênh (khớp bảng ánh xạ PR-1). Zalo nhóm chỉ có một thẻ "Chọn nhóm";
 * Bạn bè Zalo chỉ có ở Zalo cá nhân.
 */
export const AUDIENCE_TYPES_BY_CHANNEL = Object.freeze({
  email: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual']),
  zalo: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends']),
  zalo_group: Object.freeze(['zalo_groups']),
});

/** Cách gửi ở bước "Khi nào gửi?". PR-2 chỉ có `now`; PR-3 thêm `scheduled`, `continuous`, `recurring` vào đây. */
export const WHEN_OPTION_IDS = Object.freeze(['now']);

/** Số biểu mẫu tối đa chọn một lúc — khớp trần của node "Dữ liệu Biểu mẫu" (readFormSubmissionsFormIds.js). */
export const MAX_FORM_IDS = 50;

export const EMPTY_AUDIENCE = Object.freeze({
  type: null,
  customerTotal: null,
  slugs: [],
  formIds: [],
  formTitles: [],
  sheetUrl: '',
  sheetName: '',
  sheetCheckedUrl: '',
  manualText: '',
  uids: [],
  groupIds: [],
  groupNames: [],
});

export const createInitialWizardState = () => ({
  channel: null,
  /** `{ id, label }` của tài khoản gửi đã chọn; null = chưa chọn. */
  sender: null,
  audience: { ...EMPTY_AUDIENCE },
  /** `mode`: null | 'template' | 'custom'. */
  content: { mode: null, templateId: null, templateName: '', subject: '', body: '' },
  /** PR-2: chỉ `{ type: 'now' }`. PR-3 mở rộng. */
  schedule: { type: 'now' },
  campaignName: '',
});

/** Email dùng tài khoản email; Zalo cá nhân và Zalo nhóm dùng chung danh sách tài khoản Zalo. */
export const senderKindOf = (channel) => (channel === 'email' ? 'email' : 'zalo');

/** Mẫu tin của email nằm ở `email_templates`, của Zalo (cá nhân + nhóm) ở `zalo_templates`. */
export const templateKindOf = (channel) => (channel === 'email' ? 'email' : 'zalo');

/** Trường dữ liệu gắn với tài khoản gửi: đổi tài khoản thì phải chọn lại (nhóm/bạn bè của nick khác). */
const ACCOUNT_BOUND_AUDIENCE = Object.freeze({ uids: [], groupIds: [], groupNames: [] });

/**
 * Đổi kênh: xoá mọi lựa chọn không còn hợp lệ với kênh mới.
 * - Tài khoản gửi: giữ nếu cùng loại (Zalo cá nhân ↔ Zalo nhóm dùng chung nick), còn lại xoá.
 * - Nguồn người nhận: loại không thuộc kênh mới → xoá sạch; "Tự nhập" đổi giữa email ↔ số điện thoại → xoá chữ đã gõ.
 * - Mẫu tin: đổi giữa email ↔ Zalo thì bỏ mẫu đã chọn (khác kho mẫu); chữ tự soạn được giữ.
 *
 * @param {object} state trạng thái trình
 * @param {string} channel kênh mới
 * @returns {object} trạng thái mới (cùng tham chiếu nếu kênh không đổi)
 */
export const applyChannelChange = (state, channel) => {
  if (state.channel === channel) return state;
  const next = { ...state, channel };

  if (senderKindOf(state.channel) !== senderKindOf(channel)) {
    next.sender = null;
  }

  const allowedTypes = AUDIENCE_TYPES_BY_CHANNEL[channel] || [];
  if (!allowedTypes.includes(state.audience.type)) {
    // Zalo nhóm chỉ có đúng một nguồn ("Chọn nhóm") nên được chọn sẵn; các kênh khác để người dùng tự chọn.
    next.audience = { ...EMPTY_AUDIENCE, type: channel === 'zalo_group' ? 'zalo_groups' : null };
  } else if (state.audience.type === 'manual' && senderKindOf(state.channel) !== senderKindOf(channel)) {
    next.audience = { ...state.audience, manualText: '' };
  }

  if (templateKindOf(state.channel) !== templateKindOf(channel) && state.content.mode === 'template') {
    next.content = { ...state.content, templateId: null, templateName: '' };
  }
  return next;
};

/**
 * Đổi tài khoản gửi: nhóm/bạn bè đã chọn thuộc nick cũ nên bị xoá.
 *
 * @param {object} state
 * @param {{ id: number|string, label: string }|null} sender
 */
export const applySenderChange = (state, sender) => {
  const sameSender = String(state.sender?.id ?? '') === String(sender?.id ?? '');
  if (sameSender) return { ...state, sender };
  return { ...state, sender, audience: { ...state.audience, ...ACCOUNT_BOUND_AUDIENCE } };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Chuẩn hoá số điện thoại di động VN giống backend (`vietnamesePhone.util.js`): bỏ khoảng trắng/ngoặc/gạch/chấm,
 * +84/84 → 0, 9 số đầu 3|5|7|8|9 → thêm 0. Hợp lệ khi đúng `0[35789]` + 8 số.
 *
 * @param {string} raw
 * @returns {string}
 */
export const normalizePhoneForCampaign = (raw) => {
  let cleaned = String(raw ?? '').trim().replace(/[\s().-]/g, '');
  if (!cleaned) return '';
  if (/^(?:\+84|84)([35789]\d{8})$/.test(cleaned)) {
    cleaned = `0${cleaned.replace(/^(?:\+84|84)/, '')}`;
  } else if (/^[35789]\d{8}$/.test(cleaned)) {
    cleaned = `0${cleaned}`;
  }
  return cleaned;
};

const isValidPhone = (value) => /^0[35789]\d{8}$/.test(value);

/**
 * Tách ô "Tự nhập danh sách". Dấu ngăn: xuống dòng, phẩy, chấm phẩy; email còn tách cả bằng khoảng trắng (email không có
 * khoảng trắng). Số điện thoại thì khoảng trắng có thể nằm TRONG số ("0901 234 567") nên một dòng được thử nguyên cả dòng
 * trước, chỉ khi không thành số hợp lệ mới thử tách theo khoảng trắng (mọi phần đều phải hợp lệ, không thì báo sai cả dòng).
 * Email viết thường, số điện thoại chuẩn hoá; bỏ trùng. Mục sai định dạng vào `invalid` để người dùng sửa — server sẽ từ chối
 * cả danh sách nếu còn một mục sai.
 *
 * @param {string} text
 * @param {'email'|'phone'} kind
 * @returns {{ valid: string[], invalid: string[] }}
 */
export const parseManualRecipients = (text, kind) => {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  const accept = (value) => {
    if (seen.has(value)) return;
    seen.add(value);
    valid.push(value);
  };
  const reject = (token) => {
    if (!invalid.includes(token)) invalid.push(token);
  };

  const pieces = String(text || '')
    .split(kind === 'email' ? /[\s,;]+/ : /[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const piece of pieces) {
    if (kind === 'email') {
      const email = piece.toLowerCase();
      if (EMAIL_PATTERN.test(email)) accept(email);
      else reject(piece);
      continue;
    }
    const whole = normalizePhoneForCampaign(piece);
    if (isValidPhone(whole)) {
      accept(whole);
      continue;
    }
    const parts = piece.split(/\s+/).filter(Boolean);
    const normalizedParts = parts.map(normalizePhoneForCampaign);
    if (parts.length > 1 && normalizedParts.every(isValidPhone)) normalizedParts.forEach(accept);
    else reject(piece);
  }
  return { valid, invalid };
};

const manualKindOf = (channel) => (channel === 'email' ? 'email' : 'phone');

/**
 * Bước đã đủ thông tin để bấm "Tiếp tục" chưa.
 *
 * @param {string} stepId một trong SIMPLE_STEP_IDS
 * @param {object} state
 * @returns {boolean}
 */
export const isStepComplete = (stepId, state) => {
  const { channel, sender, audience, content, schedule } = state;
  switch (stepId) {
    case 'channel':
      return SIMPLE_CHANNELS.includes(channel) && Boolean(sender?.id);
    case 'audience': {
      if (!AUDIENCE_TYPES_BY_CHANNEL[channel]?.includes(audience.type)) return false;
      switch (audience.type) {
        case 'customers':
          // Biết chắc là 0 khách thì không có gì để gửi; chưa biết (lỗi tải) thì để server báo ở bước Xem lại.
          return audience.customerTotal !== 0;
        case 'landing':
          return audience.slugs.length > 0;
        case 'form':
          return audience.formIds.length > 0;
        case 'sheet':
          return Boolean(audience.sheetUrl.trim()) && audience.sheetCheckedUrl === audience.sheetUrl.trim();
        case 'manual': {
          const { valid, invalid } = parseManualRecipients(audience.manualText, manualKindOf(channel));
          return valid.length > 0 && invalid.length === 0;
        }
        case 'zalo_friends':
          return audience.uids.length > 0;
        case 'zalo_groups':
          // Bắt buộc ≥ 1 nhóm: groupIds rỗng = server gửi MỌI nhóm của nick (PLAN §5).
          return audience.groupIds.length > 0;
        default:
          return false;
      }
    }
    case 'content':
      if (content.mode === 'template') return Number(content.templateId) > 0;
      if (content.mode === 'custom') {
        if (!content.body.trim()) return false;
        return channel !== 'email' || Boolean(content.subject.trim());
      }
      return false;
    case 'when':
      return WHEN_OPTION_IDS.includes(schedule?.type);
    case 'review':
      return true;
    default:
      return false;
  }
};

/**
 * Body gửi cho `POST /campaigns/simple[/preview]` — đúng hợp đồng PR-1, chỉ mang các trường của nguồn đang chọn.
 *
 * @param {object} state
 * @returns {object}
 */
export const buildSimpleCampaignBody = (state) => {
  const { channel, sender, audience, content, campaignName } = state;
  const audienceBody = { type: audience.type };
  switch (audience.type) {
    case 'landing':
      audienceBody.slugs = [...audience.slugs];
      break;
    case 'form':
      audienceBody.formIds = audience.formIds.map(Number);
      break;
    case 'sheet':
      audienceBody.sheetUrl = audience.sheetUrl.trim();
      if (audience.sheetName.trim()) audienceBody.sheetName = audience.sheetName.trim();
      break;
    case 'manual': {
      const { valid } = parseManualRecipients(audience.manualText, manualKindOf(channel));
      if (channel === 'email') audienceBody.emails = valid;
      else audienceBody.phones = valid;
      break;
    }
    case 'zalo_friends':
      audienceBody.uids = audience.uids.map(String);
      break;
    case 'zalo_groups':
      audienceBody.groupIds = audience.groupIds.map(String);
      break;
    default:
      break;
  }

  let contentBody;
  if (content.mode === 'template') {
    contentBody = { mode: 'template', templateId: Number(content.templateId) };
  } else {
    contentBody = { mode: 'custom', body: content.body.trim() };
    if (channel === 'email') contentBody.subject = content.subject.trim();
  }

  const body = {
    channel,
    senderId: Number(sender?.id),
    audience: audienceBody,
    content: contentBody,
  };
  const name = String(campaignName || '').trim();
  if (name) body.campaignName = name;
  return body;
};

/** Mở lớp bọc `{ success, data }` nếu có; server chưa bọc thì dùng thẳng thân phản hồi. */
export const unwrapResponseData = (response) => {
  const body = response?.data;
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return body.data;
  }
  return body && typeof body === 'object' ? body : {};
};

/** Câu lỗi server trả về (`message`), rơi về `fallback` khi không có. */
export const getServerMessage = (error, fallback = '') =>
  String(error?.response?.data?.message || '').trim() || fallback;

/**
 * Chuẩn hoá phản hồi preview. `readyToCreate` chỉ true khi server nói đúng `true` (thiếu trường = chưa cho gửi).
 *
 * @param {object} data đã `unwrapResponseData`
 */
export const normalizePreview = (data) => {
  const rawCount = data?.recipientCount;
  const recipientCount = rawCount === null || rawCount === undefined || rawCount === '' || !Number.isFinite(Number(rawCount))
    ? null
    : Number(rawCount);
  return {
    readyToCreate: data?.readyToCreate === true,
    issues: Array.isArray(data?.issues) ? data.issues : [],
    estimate: data?.estimate && typeof data.estimate === 'object' ? data.estimate : null,
    recipientCount,
  };
};

/**
 * Một `issue` của preview → câu hiển thị. Chấp nhận chuỗi, `{ message }` hoặc `{ code }` (có bản dịch
 * `simpleCampaign.issues.<code>` thì dùng, không thì câu chung).
 *
 * @param {string|object} issue
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
export const describeIssue = (issue, t) => {
  if (typeof issue === 'string') return issue.trim() || t('simpleCampaign.issues.unknown');
  const message = String(issue?.message || '').trim();
  if (message) return message;
  const code = String(issue?.code || '').trim();
  if (code) {
    const key = `simpleCampaign.issues.${code}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return t('simpleCampaign.issues.unknown');
};

const looksLikeZaloId = (value) => /^\d{9,15}$/.test(String(value || '').replace(/[\s-]/g, ''));

/**
 * `/email-settings?status=active` → danh sách chọn tài khoản gửi.
 *
 * @param {Array<object>} items
 * @returns {Array<{ id: number, label: string, sublabel: string, usable: boolean, problem: null }>}
 */
export const mapEmailAccounts = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    id: Number(item.id),
    label: String(item.email || item.name || `#${item.id}`),
    sublabel: item.email && item.name && item.name !== item.email ? String(item.name) : '',
    isDefault: item.isDefault === true,
    usable: true,
    problem: null,
  }));

/**
 * `/zalo/accounts/selectable` → danh sách chọn. Dùng được khi đang kết nối, còn bật và không bị khoá theo gói;
 * ngược lại `problem` = 'locked' | 'disconnected' để hiện lý do + link "Kết nối lại".
 *
 * @param {Array<object>} items
 */
export const mapZaloAccounts = (items) =>
  (Array.isArray(items) ? items : []).map((item) => {
    const rawName = item.displayName || item.name || item.zaloName || item.phone || '';
    const label = looksLikeZaloId(rawName) ? (item.zaloName || item.phone || '') : rawName;
    const locked = item.isLocked === true;
    const connected = String(item.status || '') === 'connected' && item.isActive !== false;
    return {
      id: Number(item.id),
      label: String(label || `#${item.id}`),
      sublabel: '',
      isDefault: item.isDefault === true,
      usable: !locked && connected,
      problem: locked ? 'locked' : (connected ? null : 'disconnected'),
    };
  });
