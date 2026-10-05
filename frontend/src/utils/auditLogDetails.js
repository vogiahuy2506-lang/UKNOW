/**
 * Cột "Chi tiết" của trang Nhật ký hoạt động (khách: /app/settings/audit-logs, quản trị: Nhật ký hệ thống).
 *
 * Trước 04/10/2026 cả hai trang in thẳng `khoá: JSON.stringify(giá trị)` — người thường đọc ra
 * `nodesSau: 2, nodesTruoc: 0`, `slug: null, isPublished: false`, `permissions: {"forms":true,…}`.
 * `formatAuditDetails` đổi `details` thành một câu ngắn, không còn tên khoá kỹ thuật, không còn JSON.
 *
 * Hình dạng `details` lấy từ chỗ BACKEND ghi (grep `logWorkspace(` / `logSystem(` / `auditService.log(`),
 * không đoán — mỗi formatter dưới đây ghi chú nơi ghi. Action chưa có formatter đi qua nhánh mặc định:
 * bỏ khoá kỹ thuật (id, sessionKey, via, source…), đổi khoá còn lại sang nhãn đọc được, đổi giá trị
 * (true/false → Có/Không, ngày ISO → dd/mm/yyyy hh:mm giờ VN, mảng/object → đếm phần tử).
 *
 * Chuỗi chữ nằm ở `auditLogs.details.*` (vi.js / en.js). `t()` của dự án trả lại CHÍNH khoá khi thiếu
 * bản dịch, nên mọi chỗ tra nhãn ở đây phải so với khoá chứ không dùng `t(key) || dự_phòng`.
 */

const SEP = ' · ';
const NS = 'auditLogs.details';
const EMPTY = '—';
const MAX_TEXT = 120;

/* ───────────────────────── tra chữ ───────────────────────── */

/** Tra một khoá; thiếu bản dịch → null (t() trả lại chính khoá). */
function lookup(t, key) {
  if (typeof t !== 'function') return null;
  const raw = t(key);
  return typeof raw === 'string' && raw && raw !== key ? raw : null;
}

function fill(text, params) {
  return text.replace(/\{(\w+)\}/g, (_, name) => (params && params[name] !== undefined ? String(params[name]) : `{${name}}`));
}

/** Chữ có điền tham số. Tự điền để không phụ thuộc `t` có nội suy hay không. Thiếu bản dịch → trả khoá (để test bắt). */
function tr(t, path, params) {
  const key = `${NS}.${path}`;
  const raw = lookup(t, key);
  return fill(raw === null ? key : raw, params);
}

/** "someKey_name" → "Some key name". Lưới cuối cho giá trị / khoá lạ — không bao giờ in tên khoá thô. */
function humanize(code) {
  const text = String(code || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** Nhãn của một giá trị liệt kê (kênh, trạng thái…). Không có nhãn → chữ đã humanize, không phải mã thô. */
function enumLabel(t, group, value) {
  if (value === null || value === undefined || value === '') return '';
  const text = lookup(t, `${NS}.${group}.${value}`);
  return text || humanize(value);
}

/* ───────────────────────── giá trị ───────────────────────── */

const isNil = (v) => v === null || v === undefined || v === '';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function numberLocale(locale) {
  return locale === 'en' ? 'en-US' : 'vi-VN';
}

function fmtNumber(n, locale) {
  return Number(n).toLocaleString(numberLocale(locale));
}

/** dd/mm/yyyy theo giờ Việt Nam (cố định, không theo múi giờ của máy). */
function fmtDate(value, locale, withTime = false) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const opts = { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', opts).format(d);
}

function clip(text, max = MAX_TEXT) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function fmtBytes(bytes, locale) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${fmtNumber(n, locale)} B`;
  if (n < 1024 * 1024) return `${fmtNumber(Math.round(n / 102.4) / 10, locale)} KB`;
  return `${fmtNumber(Math.round(n / 104857.6) / 10, locale)} MB`;
}

/** Giá trị đơn lẻ cho nhánh mặc định. Trả '' = bỏ. */
function fmtValue(t, value, locale) {
  if (isNil(value)) return '';
  if (typeof value === 'boolean') return tr(t, value ? 'yes' : 'no');
  if (typeof value === 'number') return Number.isFinite(value) ? fmtNumber(value, locale) : '';
  if (typeof value === 'string') return ISO_DATE.test(value) ? fmtDate(value, locale, value.length > 10) : clip(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.every((v) => ['string', 'number'].includes(typeof v)) && value.length <= 5) {
      return value.map((v) => clip(v, 40)).join(', ');
    }
    return tr(t, 'items', { n: fmtNumber(value.length, locale) });
  }
  if (isObject(value)) {
    const n = Object.keys(value).length;
    return n === 0 ? '' : tr(t, 'items', { n: fmtNumber(n, locale) });
  }
  return '';
}

const joinParts = (parts) => parts.filter(Boolean).join(SEP);

/** Số hạn mức: null/undefined = không giới hạn. */
const fmtLimit = (t, value, locale) => (isNil(value) ? tr(t, 'unlimited') : fmtNumber(value, locale));

/* ───────────────────────── nhánh mặc định ───────────────────────── */

/**
 * Khoá kỹ thuật — người dùng không cần thấy, và thường vô nghĩa (id nội bộ, khoá phiên, nhãn đường đi).
 * `via` / `source` / `provider` là nhãn nội bộ; `permissions` đi qua formatter riêng nhưng nếu lọt xuống đây
 * thì cũng chỉ đếm (xem fmtValue).
 */
const TECHNICAL_KEY =
  /(^id$|Id$|Ids$|^sessionKey$|^accountKey$|^via$|^source$|^provider$|^payloadKeys$|token|secret|password|^hash$|^ip$|userAgent)/i;

function defaultFormatter(t, details, locale) {
  const parts = [];
  for (const [key, value] of Object.entries(details)) {
    if (TECHNICAL_KEY.test(key)) continue;
    const text = fmtValue(t, value, locale);
    if (!text) continue;
    const label = lookup(t, `${NS}.keys.${key}`) || humanize(key);
    parts.push(`${label}: ${text}`);
  }
  return joinParts(parts);
}

/* ───────────────────────── formatter riêng ───────────────────────── */

const quoted = (t, path, name) => (isNil(name) ? '' : tr(t, path, { name: clip(name, 80) }));

/** Phần "kênh" dùng chung: 'zalo_personal' → 'Zalo cá nhân'. */
const channelName = (t, code) => enumLabel(t, 'channel', code);

const FORMATTERS = {};
const register = (actions, fn) => actions.forEach((a) => { FORMATTERS[a] = fn; });

// landingPageAdmin.controller.js:68/100 → { slug, title, isPublished }; :393 → { sheetsSync: <cấu hình> }
register(['LANDING_PAGE_CREATED', 'LANDING_PAGE_UPDATED'], (t, d) => joinParts([
  quoted(t, 'landing.title', d.title),
  isNil(d.slug) ? '' : tr(t, 'landing.slug', { slug: String(d.slug).replace(/^\/+/, '') }),
  typeof d.isPublished === 'boolean' ? tr(t, d.isPublished ? 'landing.published' : 'landing.unpublished') : '',
  isNil(d.sheetsSync) ? '' : tr(t, 'landing.sheetsSync'),
]));

// landingPageAdmin.controller.js:202/228/285 → { hostname, status, isApexDomain?, restoredFreeLink? }
register(['LANDING_DOMAIN_UPDATED', 'LANDING_DOMAIN_VERIFIED'], (t, d) => joinParts([
  isNil(d.hostname) ? '' : tr(t, 'domain.host', { hostname: d.hostname }),
  d.isApexDomain === true ? tr(t, 'domain.apex') : '',
  d.restoredFreeLink === true ? tr(t, 'domain.restoredFree') : '',
  isNil(d.status) ? '' : enumLabel(t, 'domainStatus', d.status),
]));

// zaloTemplate.controller.js:19 / emailTemplate.controller.js:19 → { templateName, templateCode, category }
register([
  'EMAIL_TEMPLATE_CREATED', 'EMAIL_TEMPLATE_UPDATED', 'EMAIL_TEMPLATE_DELETED',
  'ZALO_TEMPLATE_CREATED', 'ZALO_TEMPLATE_UPDATED', 'ZALO_TEMPLATE_DELETED',
], (t, d) => joinParts([
  quoted(t, 'template.name', d.templateName),
  isNil(d.category) ? '' : tr(t, 'template.category', { category: clip(d.category, 60) }),
]));

// campaign.controller.js:322 → { name, type, via }
register(['CAMPAIGN_CREATED'], (t, d) => joinParts([
  quoted(t, 'campaign.name', d.name),
  isNil(d.type) ? '' : tr(t, 'campaign.channel', { channel: channelName(t, d.type) }),
  isNil(d.via) ? '' : enumLabel(t, 'campaignVia', d.via),
]));

// campaign.controller.js:385 → { nodesTruoc: số khối trước (null nếu không biết), nodesSau }
register(['CAMPAIGN_UPDATED'], (t, d, locale) => {
  if (typeof d.nodesSau !== 'number') return '';
  if (typeof d.nodesTruoc !== 'number') return tr(t, 'campaign.stepsAfter', { after: fmtNumber(d.nodesSau, locale) });
  return tr(t, 'campaign.steps', { before: fmtNumber(d.nodesTruoc, locale), after: fmtNumber(d.nodesSau, locale) });
});

// campaign.controller.js:752 → { runId, source: 'campaign_run'|'schedule', continuousMode, via }
register(['CAMPAIGN_RUN_STARTED'], (t, d) => joinParts([
  typeof d.continuousMode === 'boolean' ? tr(t, d.continuousMode ? 'run.continuous' : 'run.once') : '',
  d.source === 'schedule' ? tr(t, 'run.fromSchedule') : '',
]));

// campaign.controller.js:1478 → { reason }
register(['CAMPAIGN_APPROVAL_REJECTED'], (t, d) => (isNil(d.reason) ? '' : tr(t, 'approval.reason', { reason: clip(d.reason) })));

// campaignApproval.service.js:80 → { threshold, totalCustomers, actorUserId }
register(['CAMPAIGN_APPROVAL_REQUESTED'], (t, d, locale) => joinParts([
  typeof d.totalCustomers === 'number' ? tr(t, 'approval.recipients', { n: fmtNumber(d.totalCustomers, locale) }) : '',
  typeof d.threshold === 'number' && d.threshold > 0 ? tr(t, 'approval.threshold', { n: fmtNumber(d.threshold, locale) }) : '',
]));

// employee.controller.js:398 → { before, after } (số người nhận hoặc null/0 = tắt)
register(['CAMPAIGN_APPROVAL_THRESHOLD_UPDATED'], (t, d, locale) => {
  const show = (v) => (typeof v === 'number' && v > 0 ? tr(t, 'approval.recipients', { n: fmtNumber(v, locale) }) : tr(t, 'off'));
  return tr(t, 'approval.thresholdChange', { before: show(d.before), after: show(d.after) });
});

// campaign.controller.js:506 → { viaSchedule:false }; campaignSchedule.controller.js:396/590 → { viaSchedule:true, scheduleId, previousStatus }
register(['CAMPAIGN_ACTIVATED'], (t, d) => joinParts([
  tr(t, d.viaSchedule === true ? 'activated.viaSchedule' : 'activated.manual'),
  isNil(d.previousStatus) ? '' : tr(t, 'activated.previous', { status: enumLabel(t, 'campaignStatus', d.previousStatus) }),
]));

// campaignSchedule.controller.js:389/638 → { scheduleId, scheduleType, cronExpression, enabled }
register(['CAMPAIGN_SCHEDULE_CREATED', 'CAMPAIGN_SCHEDULE_DELETED'], (t, d) => joinParts([
  isNil(d.scheduleType) ? '' : tr(t, 'schedule.type', { type: enumLabel(t, 'scheduleType', d.scheduleType) }),
  typeof d.enabled === 'boolean' ? tr(t, d.enabled ? 'schedule.enabled' : 'schedule.disabled') : '',
]));

// campaignSchedule.controller.js:583 → { scheduleId, changedFields: ['scheduleName'|'scheduleType'|'cronExpression'], enabled }
register(['CAMPAIGN_SCHEDULE_UPDATED'], (t, d) => {
  const fields = Array.isArray(d.changedFields) ? d.changedFields.map((f) => enumLabel(t, 'scheduleField', f)).filter(Boolean) : [];
  return joinParts([
    fields.length ? tr(t, 'schedule.changed', { fields: fields.join(', ') }) : '',
    typeof d.enabled === 'boolean' ? tr(t, d.enabled ? 'schedule.enabled' : 'schedule.disabled') : '',
  ]);
});

// campaignSchedule.controller.js:573 → { scheduleId, enabled, previousEnabled }
// scheduler.js:258 (tự tắt sau nhiều lần lỗi) → { scheduleId, enabled:false, automatic:true, reason: <thông báo lỗi gần nhất> }
register(['CAMPAIGN_SCHEDULE_TOGGLED'], (t, d) => {
  if (d.automatic === true) {
    return joinParts([
      tr(t, 'schedule.autoOff'),
      isNil(d.reason) ? '' : tr(t, 'schedule.reason', { reason: clip(d.reason) }),
    ]);
  }
  if (typeof d.enabled !== 'boolean') return '';
  return tr(t, d.enabled ? 'schedule.turnedOn' : 'schedule.turnedOff');
});

// auth.controller.js:353/726 → { source: 'signup_auto_trial', planCode, expiresAt }
// (đây là chỗ DUY NHẤT ghi USER_PLAN_CHANGED — gói mua / admin đổi không đi qua audit này)
register(['USER_PLAN_CHANGED'], (t, d, locale) => joinParts([
  isNil(d.planCode) ? '' : tr(t, 'plan.name', { plan: planName(t, d.planCode) }),
  isNil(d.expiresAt) ? '' : tr(t, 'plan.expires', { date: fmtDate(d.expiresAt, locale) }),
  d.source === 'signup_auto_trial' ? tr(t, 'plan.autoTrial') : '',
]));

// signupTrial.service.js:54 → { source: 'signup_auto_trial_google', planCode, error }
register(['USER_PLAN_CHANGE_FAILED'], (t, d) => joinParts([
  isNil(d.planCode) ? '' : tr(t, 'plan.failed', { plan: planName(t, d.planCode) }),
  isNil(d.error) ? '' : tr(t, 'plan.error', { error: clip(d.error) }),
]));

function planName(t, code) {
  return lookup(t, `pricing.planNames.${code}`) || humanize(code);
}

// adminPlans.controller.js:102/126/136 → { code, name } | { name } | { softDelete }
register(['PLAN_CREATED', 'PLAN_UPDATED'], (t, d) => joinParts([
  quoted(t, 'plan.quotedName', d.name),
  isNil(d.code) ? '' : tr(t, 'plan.code', { code: d.code }),
]));
register(['PLAN_DELETED'], (t, d) => (typeof d.softDelete === 'boolean' ? tr(t, d.softDelete ? 'plan.softDeleted' : 'plan.hardDeleted') : ''));

// adminPlans.controller.js:211 → { email, lockedResources: [{resourceKey, resourceId}] }
register(['PLAN_UNASSIGNED'], (t, d, locale) => joinParts([
  isNil(d.email) ? '' : tr(t, 'plan.unassignedOf', { email: d.email }),
  Array.isArray(d.lockedResources) && d.lockedResources.length > 0
    ? tr(t, 'plan.locked', { n: fmtNumber(d.lockedResources.length, locale) })
    : '',
]));

// auditVoucherMeta (voucherOffer.util.js:218) → { voucherId, offerMode, name, restored? }; xoá → { soft:true } | { hard:true }
register(['VOUCHER_CREATED', 'VOUCHER_UPDATED', 'VOUCHER_DELETED'], (t, d) => joinParts([
  quoted(t, 'voucher.name', d.name),
  isNil(d.code) ? '' : tr(t, 'voucher.code', { code: d.code }),
  isNil(d.offerMode) ? '' : enumLabel(t, 'offerMode', d.offerMode),
  d.restored === true ? tr(t, 'voucher.restored') : '',
  d.soft === true ? tr(t, 'voucher.softDeleted') : '',
  d.hard === true ? tr(t, 'voucher.hardDeleted') : '',
]));

// auth.controller.js:368/739 → { username, email, provider: 'local'|'google' }
register(['USER_REGISTERED'], (t, d) => joinParts([
  d.email || d.username || '',
  isNil(d.provider) ? '' : enumLabel(t, 'provider', d.provider),
]));

// adminMembers.controller.js:52/67 → { from, to, email } với from/to ∈ user|admin
register(['USER_ROLE_CHANGED'], (t, d) => joinParts([
  d.email || '',
  isNil(d.from) || isNil(d.to) ? '' : tr(t, 'role.change', { from: enumLabel(t, 'role', d.from), to: enumLabel(t, 'role', d.to) }),
]));

// adminMembers.controller.js:100 → { originalEmail, newEmail, releaseTrialHistory, anonymizedTrialOrdersCount }
register(['USER_EMAIL_DETACHED'], (t, d, locale) => joinParts([
  isNil(d.originalEmail) || isNil(d.newEmail) ? '' : tr(t, 'user.emailChange', { from: d.originalEmail, to: d.newEmail }),
  d.releaseTrialHistory === true ? tr(t, 'user.releasedTrial') : '',
  typeof d.anonymizedTrialOrdersCount === 'number' && d.anonymizedTrialOrdersCount > 0
    ? tr(t, 'user.anonymizedOrders', { n: fmtNumber(d.anonymizedTrialOrdersCount, locale) })
    : '',
]));

// adminMembers.controller.js:120 → { originalEmail }
register(['USER_PURGED'], (_t, d) => d.originalEmail || '');

// twoFactor.service.js:202 → { email, hadTwoFactor }
register(['TWO_FACTOR_RESET_BY_ADMIN'], (t, d) => joinParts([
  d.email || '',
  typeof d.hadTwoFactor === 'boolean' ? tr(t, d.hadTwoFactor ? 'user.hadTwoFactor' : 'user.noTwoFactor') : '',
]));

// employee.controller.js:89/116/170 → { username?, email, fullName, method: 'invited'|'invited_link', invitationSent }
register(['EMPLOYEE_ADDED'], (t, d) => {
  const who = d.fullName && d.email ? `${d.fullName} (${d.email})` : d.fullName || d.email || d.username || '';
  return joinParts([
    who,
    typeof d.invitationSent === 'boolean' ? tr(t, d.invitationSent ? 'employee.inviteSent' : 'employee.inviteNotSent') : '',
  ]);
});

// employee.controller.js:194 → { before: {fullName, email}, after: {fullName, email} }
register(['EMPLOYEE_INFO_UPDATED'], (t, d) => {
  const before = isObject(d.before) ? d.before : {};
  const after = isObject(d.after) ? d.after : {};
  const parts = [];
  for (const [field, labelKey] of [['fullName', 'employee.fieldName'], ['email', 'employee.fieldEmail']]) {
    if ((before[field] ?? null) !== (after[field] ?? null)) {
      parts.push(tr(t, labelKey, { before: isNil(before[field]) ? EMPTY : before[field], after: isNil(after[field]) ? EMPTY : after[field] }));
    }
  }
  return joinParts(parts);
});

// employee.controller.js:268 → { status: 'active'|'inactive' }
register(['EMPLOYEE_STATUS_UPDATED'], (t, d) => (isNil(d.status) ? '' : tr(t, 'employee.status', { status: enumLabel(t, 'employeeStatus', d.status) })));

// employee.controller.js:226 → { dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit, dailyAiCreditLimit, periodAiCreditLimit }
register(['EMPLOYEE_LIMITS_UPDATED'], (t, d, locale) => {
  const group = (key, daily, period) => (daily === undefined && period === undefined
    ? ''
    : tr(t, `limits.${key}`, { daily: fmtLimit(t, daily, locale), period: fmtLimit(t, period, locale) }));
  return joinParts([
    group('email', d.dailyEmailLimit, d.monthlyEmailLimit),
    group('zalo', d.dailyZaloLimit, d.monthlyZaloLimit),
    group('ai', d.dailyAiCreditLimit, d.periodAiCreditLimit),
  ]);
});

// employee.controller.js updateChannelAccounts → { channel: 'zalo_personal', before: number[], after: number[] } (id tài khoản — chỉ đếm)
register(['EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED'], (t, d, locale) => {
  if (!Array.isArray(d.after)) return '';
  return joinParts([
    channelName(t, d.channel || 'zalo_personal'),
    tr(t, 'employee.channelAccounts', {
      after: fmtNumber(d.after.length, locale),
      before: fmtNumber(Array.isArray(d.before) ? d.before.length : 0, locale),
    }),
  ]);
});

/**
 * Khoá quyền nhân viên (lưu trong DB, snake_case) → khoá nhãn trong `employee.permissions.*`.
 * Khớp PERMISSION_FIELDS của EmployeeManagement.jsx; email_settings + zalo_settings (và hai mẫu tin) cùng
 * một nhãn nên danh sách đã khử trùng. Test `auditLogDetails.spec.js` ghim bảng này với file đó.
 */
export const EMPLOYEE_PERMISSION_LABEL_KEYS = Object.freeze({
  email_settings: 'channelManagement',
  zalo_settings: 'channelManagement',
  email_templates: 'messageTemplates',
  zalo_templates: 'messageTemplates',
  courses: 'productManagement',
  landing_pages: 'landingPages',
  campaigns_view: 'campaignView',
  campaigns_create: 'campaignCreate',
  campaigns_run: 'campaignRun',
  customers: 'customers',
  leads: 'leads',
  forms: 'forms',
  chatbots_manage: 'chatbotsManage',
  chatbot_channels_manage: 'chatbotChannelsManage',
  inbox_view: 'inboxView',
  inbox_reply: 'inboxReply',
  inbox_manage: 'inboxManage',
  media_library_view: 'mediaLibraryView',
  media_library_manage: 'mediaLibraryManage',
  reports_view: 'reportsView',
  ai_assistant_use: 'aiAssistantUse',
  marketplace_manage: 'marketplaceManage',
  marketplace_purchase: 'marketplacePurchase',
  integrations_manage: 'integrationsManage',
});

const PERMISSION_SHOWN = 4;

// employee.controller.js:251 → { permissions: { forms: true, customers: false, … } }
register(['EMPLOYEE_PERMISSIONS_UPDATED'], (t, d, locale) => {
  if (!isObject(d.permissions)) return '';
  const labels = [];
  for (const [key, granted] of Object.entries(d.permissions)) {
    if (granted !== true) continue;
    const labelKey = EMPLOYEE_PERMISSION_LABEL_KEYS[key];
    const label = (labelKey && lookup(t, `employee.permissions.${labelKey}`)) || humanize(key);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return tr(t, 'employee.noPermission');
  const shown = labels.slice(0, PERMISSION_SHOWN).join(', ');
  const rest = labels.length - PERMISSION_SHOWN;
  return rest > 0
    ? tr(t, 'employee.allowedMore', { list: shown, n: fmtNumber(rest, locale) })
    : tr(t, 'employee.allowed', { list: shown });
});

// emailSettings.controller.js:470 → { email, emailMode: 'platform'|'smtp'|null }
register(['EMAIL_ACCOUNT_CONNECTED'], (t, d) => joinParts([
  d.email || '',
  isNil(d.emailMode) ? '' : enumLabel(t, 'emailMode', d.emailMode),
]));

// zaloSettings.controller.js:675 → { channel: 'zalo_personal', displayName }
register(['ZALO_ACCOUNT_CONNECTED'], (t, d) => joinParts([
  channelName(t, d.channel || 'zalo_personal'),
  d.displayName || '',
]));

const limitChange = (t, d, locale) => joinParts([
  tr(t, 'sendLimit.change', { before: fmtLimit(t, d.previousValue, locale), after: fmtLimit(t, d.newValue, locale) }),
  d.exceededRecommended === true ? tr(t, 'sendLimit.exceeded') : '',
]);
// emailSettings.controller.js:524 / zaloSettings.controller.js:1850 → { previousValue, newValue, exceededRecommended }
register(['EMAIL_ACCOUNT_SEND_LIMIT_UPDATED', 'ZALO_ACCOUNT_SEND_LIMIT_UPDATED'], limitChange);

// zaloSettings.controller.js:1921 → { previous: 'safe'|'fast'|'very_fast'|'custom', next }
register(['ZALO_ACCOUNT_SEND_SPEED_UPDATED'], (t, d) => (isNil(d.next)
  ? ''
  : tr(t, 'sendSpeed.change', { before: enumLabel(t, 'sendSpeed', d.previous || 'safe'), after: enumLabel(t, 'sendSpeed', d.next) })));

// channelAccountSendSettings.controller.js:52 → { channel: 'telegram'|'whatsapp', accountKey,
//   previous: {userDailySendLimit, sendSpeed}, next: {…} }
register(['CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED'], (t, d, locale) => {
  const before = isObject(d.previous) ? d.previous : {};
  const after = isObject(d.next) ? d.next : {};
  const parts = [channelName(t, d.channel)];
  if ((before.userDailySendLimit ?? null) !== (after.userDailySendLimit ?? null)) {
    parts.push(tr(t, 'sendLimit.change', { before: fmtLimit(t, before.userDailySendLimit, locale), after: fmtLimit(t, after.userDailySendLimit, locale) }));
  }
  if ((before.sendSpeed ?? null) !== (after.sendSpeed ?? null) && !isNil(after.sendSpeed)) {
    parts.push(tr(t, 'sendSpeed.change', { before: enumLabel(t, 'sendSpeed', before.sendSpeed || 'safe'), after: enumLabel(t, 'sendSpeed', after.sendSpeed) }));
  }
  return joinParts(parts);
});

// chatbot.controller.js / whatsappSettings.controller.js → { channelType, enabled?, … id nội bộ }
register([
  'CHATBOT_CHANNEL_CONNECTED', 'CHATBOT_CHANNEL_UPDATED', 'CHATBOT_CHANNEL_DISCONNECTED',
  'TELEGRAM_ACCOUNT_LOGIN', 'TELEGRAM_ACCOUNT_LOGOUT',
], (t, d) => joinParts([
  isNil(d.channelType) ? '' : tr(t, 'chatbotChannel.of', { channel: channelName(t, d.channelType) }),
  typeof d.enabled === 'boolean' ? tr(t, d.enabled ? 'on' : 'off') : '',
]));

// whatsappBaileys.controller.js:104/190/204 → { channel: 'whatsapp_baileys', sessionKey, status? } (sessionKey nội bộ, không hiện)
register(['WHATSAPP_ACCOUNT_CONNECT_STARTED', 'WHATSAPP_ACCOUNT_DISCONNECTED', 'WHATSAPP_ACCOUNT_DELETED'], (t, d) => channelName(t, d.channel || 'whatsapp'));

// whatsappBaileys.controller.js:220 → { channel, sessionKey, nickname }
register(['WHATSAPP_ACCOUNT_RENAMED'], (t, d) => (isNil(d.nickname) ? '' : tr(t, 'whatsapp.newName', { name: clip(d.nickname, 80) })));

// chatbot.controller.js:259.. → { name }
register(['CHATBOT_CREATED', 'CHATBOT_UPDATED', 'KNOWLEDGE_BASE_CREATED', 'KNOWLEDGE_BASE_UPDATED'], (t, d) => quoted(t, 'chatbot.name', d.name));

// ai.controller.js:2065/2199/2242 → { chatbotId, sourceType: 'file'|'text'|'url', chunks, pages? }
// chatbot.controller.js:312 → { knowledgeBaseId, sourceType }
register(['KNOWLEDGE_DOCUMENT_CREATED'], (t, d, locale) => joinParts([
  isNil(d.sourceType) ? '' : tr(t, 'knowledge.source', { source: enumLabel(t, 'knowledgeSource', d.sourceType) }),
  typeof d.pages === 'number' ? tr(t, 'knowledge.pages', { n: fmtNumber(d.pages, locale) }) : '',
  typeof d.chunks === 'number' ? tr(t, 'knowledge.chunks', { n: fmtNumber(d.chunks, locale) }) : '',
]));

// form.controller.js:103/152 → { method, methods, bankBin, accountNumberLast4, momoPhoneLast4, momoQrAccountLast4, enabled }
register(['FORM_PAYMENT_CONFIG_UPDATED'], (t, d) => {
  if (d.enabled === false) return tr(t, 'payment.off');
  const methods = Array.isArray(d.methods) && d.methods.length ? d.methods : (d.method ? [d.method] : []);
  const labels = methods.map((m) => {
    const name = enumLabel(t, 'paymentMethod', m);
    const last4 = m === 'bank' ? d.accountNumberLast4 : (d.momoPhoneLast4 || d.momoQrAccountLast4);
    return isNil(last4) ? name : tr(t, 'payment.withLast4', { name, last4 });
  });
  return labels.length ? tr(t, 'payment.on', { methods: labels.join(', ') }) : tr(t, 'payment.onNoMethod');
});

// unifiedInbox.controller.js:262 → { conversationId, conversationType: 'channel'|'zalo_personal'|'webchat', attachmentCount }
// :352 → { conversationType, sendStatus }; :410 → { conversationType, paused }; :492 → { conversationType }
register(['INBOX_REPLY_SENT', 'INBOX_REPLY_RETRIED', 'INBOX_CONVERSATION_DELETED'], (t, d, locale) => joinParts([
  isNil(d.conversationType) ? '' : enumLabel(t, 'conversation', d.conversationType),
  typeof d.attachmentCount === 'number' && d.attachmentCount > 0
    ? tr(t, 'inbox.attachments', { n: fmtNumber(d.attachmentCount, locale) })
    : '',
  isNil(d.sendStatus) ? '' : tr(t, 'inbox.sendStatus', { status: enumLabel(t, 'sendStatus', d.sendStatus) }),
]));

// aiActivity.controller.js:44 → { paused:false, scope:'all', resumedCount }; unifiedInbox.controller.js:410 → { conversationType, paused }
register(['INBOX_AI_PAUSE_UPDATED'], (t, d, locale) => {
  if (d.scope === 'all') {
    return joinParts([
      tr(t, 'inbox.resumeAll'),
      typeof d.resumedCount === 'number' ? tr(t, 'inbox.resumedCount', { n: fmtNumber(d.resumedCount, locale) }) : '',
    ]);
  }
  return joinParts([
    typeof d.paused === 'boolean' ? tr(t, d.paused ? 'inbox.paused' : 'inbox.resumed') : '',
    isNil(d.conversationType) ? '' : enumLabel(t, 'conversation', d.conversationType),
  ]);
});

// unifiedInbox.controller.js:204 / ai.controller.js:2332 → { source, size, mime, chatbotId? }
register(['MEDIA_UPLOADED'], (t, d, locale) => joinParts([
  d.mime ? String(d.mime) : '',
  typeof d.size === 'number' ? fmtBytes(d.size, locale) : '',
]));

// mediaLibrary.controller.js (deleteStorageObject) → { category, referenceType, displayName, sizeBytes }; ai.controller.js:2368 → { source, chatbotId }
// Dòng cũ (trước 04/10/2026) chỉ có { category, referenceType } nên tên/cỡ là tuỳ chọn.
register(['MEDIA_DELETED'], (t, d, locale) => joinParts([
  quoted(t, 'media.file', d.displayName),
  typeof d.sizeBytes === 'number' ? fmtBytes(d.sizeBytes, locale) : '',
  isNil(d.category) ? '' : tr(t, 'media.category', { category: enumLabel(t, 'mediaCategory', d.category) }),
]));

// customer.controller.js:435 → kết quả bulkUpsert { inserted, updated, skipped, campaignLinked, total }
register(['CUSTOMER_BULK_UPSERTED'], (t, d, locale) => joinParts([
  typeof d.inserted === 'number' ? tr(t, 'customer.inserted', { n: fmtNumber(d.inserted, locale) }) : '',
  typeof d.updated === 'number' ? tr(t, 'customer.updated', { n: fmtNumber(d.updated, locale) }) : '',
  typeof d.skipped === 'number' && d.skipped > 0 ? tr(t, 'customer.skipped', { n: fmtNumber(d.skipped, locale) }) : '',
]));

// adminForms.controller.js:42 → { publicKey, title }
register(['FORM_DISABLED', 'FORM_ENABLED'], (t, d) => quoted(t, 'form.title', d.title));

// adminOrders.controller.js:35 → { orderCode }; :68 → { orderCode, userId, reason, amount, statusBefore, transferRef, … }
register(['ORDER_PAID_AFTER_CANCELLED_HANDLED', 'ORDER_REFUNDED'], (t, d, locale) => joinParts([
  isNil(d.orderCode) ? '' : tr(t, 'order.code', { code: d.orderCode }),
  typeof d.amount === 'number' ? tr(t, 'order.refund', { amount: fmtNumber(d.amount, locale) }) : '',
  isNil(d.reason) ? '' : tr(t, 'order.reason', { reason: clip(d.reason) }),
]));

// adminEinvoice.controller.js:35/72 → { ok, skipped, reason, errorCode, status }
register(['EINVOICE_RETRIED', 'EINVOICE_EMAIL_RESENT'], (t, d) => joinParts([
  typeof d.ok === 'boolean' ? tr(t, d.ok ? 'einvoice.ok' : 'einvoice.notOk') : '',
  d.skipped === true ? tr(t, 'einvoice.skipped') : '',
  isNil(d.reason) ? '' : tr(t, 'einvoice.reason', { reason: clip(d.reason) }),
  isNil(d.errorCode) ? '' : tr(t, 'einvoice.errorCode', { code: d.errorCode }),
]));

// adminAiModels.controller.js:44/70 → { modelId, previousModel, newModel }
register(['AI_SYSTEM_MODEL_UPDATED', 'AI_FALLBACK_MODEL_UPDATED'], (t, d) => {
  const next = d.newModel || d.modelId;
  if (isNil(next)) return '';
  return isNil(d.previousModel) ? String(next) : tr(t, 'arrow', { before: d.previousModel, after: next });
});

// ai.controller.js:560 → { sessionId, gate, count, channel }: cùng một bước bị trợ lý AI hỏi lại tới lần thứ 3 liên tiếp
register(['WIZARD_DEAD_END'], (t, d, locale) => joinParts([
  tr(t, 'wizard.stuck', { n: fmtNumber(typeof d.count === 'number' ? d.count : 3, locale) }),
  isNil(d.gate) ? '' : tr(t, 'wizard.gate', { gate: clip(humanize(d.gate), 60) }),
  isNil(d.channel) ? '' : tr(t, 'wizard.channel', { channel: channelName(t, d.channel) }),
]));

// ai.controller.js:738 → { sessionId, action, payloadKeys }: nút bấm của trợ lý AI không làm đổi trạng thái
register(['WIZARD_STATE_NOOP'], (t, d) => (isNil(d.action) ? '' : tr(t, 'wizard.noop', { action: clip(humanize(d.action), 60) })));

// assistantTurnFailure.service.js → { sessionId, stage, code, feature }: một lượt trợ lý AI hỏng (chỉ mã, không câu chữ)
register(['AI_TURN_FAILED'], (t, d) => joinParts([
  isNil(d.stage) ? '' : tr(t, 'aiTurn.stage', { stage: clip(humanize(d.stage), 60) }),
  isNil(d.code) ? '' : tr(t, 'aiTurn.code', { code: clip(String(d.code), 60) }),
]));

/* ───────────────────────── điểm vào ───────────────────────── */

/**
 * @param {string} action   mã hành động (vd 'CAMPAIGN_UPDATED')
 * @param {object|null} details  cột `details` của audit_logs
 * @param {(key: string) => string} t  hàm dịch của useI18n()
 * @param {'vi'|'en'} locale
 * @returns {string} câu ngắn; '—' khi không có gì đáng hiện
 */
export function formatAuditDetails(action, details, t, locale = 'vi') {
  if (!isObject(details) || Object.keys(details).length === 0) return EMPTY;
  let text = '';
  try {
    const formatter = FORMATTERS[action];
    text = formatter ? formatter(t, details, locale) : '';
    if (!text) text = defaultFormatter(t, details, locale);
  } catch {
    text = '';
  }
  return text || EMPTY;
}

export default formatAuditDetails;
