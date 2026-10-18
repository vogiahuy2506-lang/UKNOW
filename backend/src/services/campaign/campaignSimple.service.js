/**
 * Tạo chiến dịch TỪNG BƯỚC (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14, PR-1).
 *
 * Trình `/app/campaigns/simple` gửi một body đơn giản (kênh + tài khoản gửi + nguồn người nhận + nội dung). Service này dựng
 * `CampaignIntentV1` Ở SERVER (KHÔNG nhận intent thô từ trình duyệt: intent có trường chỉ dành cho AI và không kiểm quyền sở hữu),
 * biên dịch bằng `compileCampaign` — bộ biên dịch tất định đang chạy thật cho trợ lý AI — rồi đi đúng chuỗi kiểm của đường AI
 * (`ai.controller.js` createCampaignFromDraft): prepareScript → người nhận nhập sẵn → thẻ xác nhận phải `readyToCreate` →
 * validateNodeConfig từng node → (chữ tự soạn) tạo mẫu tin → `campaignController.create`.
 *
 * Kết quả là chiến dịch THƯỜNG (nháp), mở được bằng trình dựng nâng cao. Không gọi AI, không tốn lượt AI.
 *
 * Phần giữ lại của đường AI và phần bỏ qua (kiểm chứng khi đọc code, 14/10/2026):
 *  - `assertResourceVersionsCurrent`: BỎ — chỉ để chống mẫu tin đổi giữa lúc xem thẻ và lúc tạo (`resourceVersions` do trình duyệt AI
 *    giữ). Ở đây không có bước "chụp thẻ rồi tạo sau"; mẫu được kiểm đúng lúc tạo bởi `buildConfirmationView`.
 *  - `wizardDataSource` / `markManualRecipientsRequired`: BỎ — là trạng thái wizard của AI; nguồn nhập tay ở đây có danh sách thật.
 *  - `assertNoEmptyContent`: chỉ chạy gián tiếp qua `applySlotsToGraph` (chữ tự soạn). KHÔNG chạy cho mẫu có sẵn: nó từ chối bước
 *    chỉ có `templateId` (không có `message`).
 */
import { compileCampaign } from '../ai/campaignCompiler.service.js';
import { isCompilableIntent } from '../ai/campaignIntent.schema.js';
import { applyLandingAudienceResolution } from '../ai/landingAudienceResolver.service.js';
import { applySlotsToGraph } from '../ai/campaignSlotFiller.service.js';
import aiCampaignDraftService from '../ai/aiCampaignDraft.service.js';
import campaignConfirmationService from '../ai/campaignConfirmation.service.js';
import aiCampaignRepository from '../../repositories/ai/aiCampaign.repository.js';
import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import campaignNodeRegistryService from './campaignNodeRegistry.service.js';
import { fillReadSheetFirstTabNames } from './readSheetAutoName.service.js';
import {
  buildChannelNotInPlanMessage,
  getChannelsBlockedByPlan,
  isAdapterCampaignChannel,
  isAdapterCampaignChannelEnabled,
} from './campaignChannelFlags.util.js';
import zaloTemplateRepository from '../../repositories/zalo/zaloTemplate.repository.js';
import { MAX_CHANNEL_STEPS, MAX_STEP_DELAY_MS, resolveStepDelayMs } from '../../utils/channelSteps.util.js';
import {
  TELEGRAM_PHOTO_EXTENSIONS,
  WHATSAPP_IMAGE_EXTENSIONS,
  assertAttachmentListWithinLimits,
} from '../../utils/channelMediaSend.util.js';
import { applyDirectRecipients } from '../../utils/directRecipients.util.js';
import { validateManualRecipients } from '../../utils/manualRecipients.util.js';
import { ALL_CUSTOMERS_LIMIT_CAP } from '../../utils/interestedLimits.util.js';
import { normalizeFormIdList } from '../../utils/campaignFormIds.util.js';
import { extractSpreadsheetId } from '../../utils/googleSheetWorksheets.util.js';
import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

/**
 * Kênh của trình từng bước. Telegram/WhatsApp (PLAN_TUNG_BUOC_TELEGRAM_WHATSAPP_2026-10-17) là kênh "adapter": chỉ dùng được khi
 * quản trị viên bật cờ kênh VÀ gói của chủ workspace có kênh đó (xem `assertAdapterChannelUsable`).
 */
export const SIMPLE_CHANNELS = Object.freeze(['email', 'zalo', 'zalo_group', 'telegram', 'whatsapp']);

/** Nguồn người nhận hợp lệ theo kênh (khớp bảng ở plan §2 bước 2). */
export const SIMPLE_AUDIENCE_TYPES_BY_CHANNEL = Object.freeze({
  email: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual']),
  zalo: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends']),
  zalo_group: Object.freeze(['zalo_groups']),
  // Telegram không nhắn được người lạ (chỉ hội thoại đang mở); WhatsApp thêm các nguồn node dữ liệu (cột SĐT). KHÔNG có nhập tay:
  // `manual` chưa nối cho hai kênh này (campaignIntent.schema.js ADAPTER_AUDIENCE_TYPES).
  // 'telegram_groups' / 'whatsapp_groups': NHÓM đã chọn của tài khoản (audience.groups = [{ recipientKey, display }]).
  telegram: Object.freeze(['conversations', 'telegram_groups']),
  whatsapp: Object.freeze(['conversations', 'customers', 'landing', 'form', 'sheet', 'whatsapp_groups']),
});

const CHANNEL_LABELS = Object.freeze({
  email: 'Email',
  zalo: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
});
/** Tên kênh trong câu báo lỗi. */
const ADAPTER_CHANNEL_NAMES = Object.freeze({ telegram: 'Telegram', whatsapp: 'WhatsApp' });
/** Mã phiên WhatsApp: `<id chủ>-<tên>` (cùng mẫu campaignIntent.schema.js / thẻ xác nhận). */
const WHATSAPP_SESSION_KEY_PATTERN = /^\d+-[A-Za-z0-9_-]{1,128}$/;

const MAX_CAMPAIGN_NAME_LENGTH = 255;
const MAX_LANDING_SLUGS = 50;
const MAX_ZALO_GROUPS = 500;
const MAX_ADAPTER_GROUPS = 500;
/** Khoá nhóm hợp lệ — khớp bộ chạy kênh (telegram.campaignChannel.js TELEGRAM_CHAT_ID_PATTERN, whatsapp.campaignChannel.js WHATSAPP_GROUP_JID_PATTERN). */
const ADAPTER_GROUP_KEY_PATTERN = Object.freeze({ telegram_groups: /^-?\d+$/, whatsapp_groups: /^\d+(?:-\d+)*@g\.us$/ });
const ADAPTER_GROUP_LABEL = Object.freeze({ telegram_groups: 'Telegram', whatsapp_groups: 'WhatsApp' });
const MAX_CUSTOM_BODY_LENGTH = Object.freeze({ email: 100000, zalo: 4000, zalo_group: 4000, telegram: 4000, whatsapp: 4096 });
const MAX_EMAIL_SUBJECT_LENGTH = 150;
/** Chuỗi tin: tin 1 + tối đa 9 tin tiếp theo (tổng 10 tin) — PLAN_HAI_TAB_TUNG_BUOC §3.1. */
export const MAX_FOLLOW_UPS = 9;
export const FOLLOW_UP_DELAY_UNITS = Object.freeze(['days', 'hours', 'minutes']);
const MAX_FOLLOW_UP_DELAY_VALUE = 9999;
/** Chữ giữ chỗ cho bước dùng mẫu trong lúc `applySlotsToGraph` (xem `applyStepContents`). */
const TEMPLATE_STEP_PLACEHOLDER = '__template__';

/** Mã issue của thẻ xác nhận → câu tiếng Việt cho người dùng + mã lỗi API khi tạo bị chặn. */
const ISSUE_INFO = Object.freeze({
  missing_sender: {
    apiCode: 'SENDER_NOT_AVAILABLE',
    message: 'Tài khoản gửi không dùng được: chưa kết nối, đã bị khoá hoặc không thuộc không gian làm việc của bạn.',
  },
  template_not_found: {
    apiCode: 'TEMPLATE_NOT_FOUND',
    message: 'Không tìm thấy mẫu tin đã chọn trong tài khoản của bạn.',
  },
  invalid_template_step: {
    apiCode: 'TEMPLATE_NOT_FOUND',
    message: 'Mẫu tin đã chọn không hợp lệ.',
  },
  missing_message_content: {
    apiCode: 'CONTENT_REQUIRED',
    message: 'Nội dung tin nhắn đang trống.',
  },
  manual_recipients_required: {
    apiCode: 'RECIPIENTS_REQUIRED',
    message: 'Chưa có người nhận nào trong danh sách.',
  },
  landing_audience_unchosen: {
    apiCode: 'RECIPIENTS_REQUIRED',
    message: 'Chưa chọn landing page nào để lấy người nhận.',
  },
  no_send_steps: {
    apiCode: 'INVALID_DRAFT_RESOURCES',
    message: 'Chiến dịch chưa có bước gửi nào.',
  },
  invalid_node_config: {
    apiCode: 'INVALID_NODE_CONFIG',
    message: 'Cấu hình chiến dịch chưa hợp lệ.',
  },
});

/**
 * Lỗi nghiệp vụ có mã HTTP — controller trả đúng `statusCode` + `code` + `message` (+ `extra` nếu có).
 */
export class SimpleCampaignError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message tiếng Việt, hiển thị được cho người dùng
   * @param {object} [extra] trường bổ sung ghép vào body lỗi (vd `missing`, `issues`)
   */
  constructor(statusCode, code, message, extra = {}) {
    super(message);
    this.name = 'SimpleCampaignError';
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

const bad = (code, message, extra) => new SimpleCampaignError(400, code, message, extra);

const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');

/** Mảng chuỗi từ mảng hoặc chuỗi phân tách bằng xuống dòng/dấu phẩy/chấm phẩy; bỏ rỗng, khử trùng, giữ thứ tự. */
function toStringList(value) {
  const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[\s,;]+/) : []);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const text = typeof item === 'string' || typeof item === 'number' ? String(item).trim() : '';
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function toPositiveInt(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Tên chiến dịch mặc định "<Kênh> – dd/MM/yyyy HH:mm" theo giờ Việt Nam.
 *
 * @param {'email'|'zalo'|'zalo_group'} channel
 * @param {Date} [now]
 * @returns {string}
 */
export function buildDefaultCampaignName(channel, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${CHANNEL_LABELS[channel] || channel} – ${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Kiểm + chuẩn hoá MỘT tin (tin 1 hoặc một tin trong `followUps`). Hàm thuần.
 *
 * @param {unknown} rawContent `{ mode:'template', templateId }` | `{ mode:'custom', subject?, body }`
 * @param {'email'|'zalo'|'zalo_group'} channel
 * @param {string} [prefix] tiền tố câu lỗi cho tin sau ("Tin 2: ")
 * @returns {{ mode: 'template', templateId: number } | { mode: 'custom', subject: string, body: string }}
 */
function normalizeStepContent(rawContent, channel, prefix = '') {
  const raw = rawContent && typeof rawContent === 'object' ? rawContent : {};
  const mode = toTrimmedString(raw.mode);
  if (mode === 'template') {
    const templateId = toPositiveInt(raw.templateId);
    if (!templateId) throw bad('TEMPLATE_REQUIRED', `${prefix}Vui lòng chọn một mẫu tin.`);
    return { mode: 'template', templateId };
  }
  if (mode === 'custom') {
    const text = toTrimmedString(raw.body);
    if (!text) throw bad('CONTENT_REQUIRED', `${prefix}Vui lòng nhập nội dung tin nhắn.`);
    if (text.length > MAX_CUSTOM_BODY_LENGTH[channel]) {
      throw bad('CONTENT_TOO_LONG', `${prefix}Nội dung tối đa ${MAX_CUSTOM_BODY_LENGTH[channel].toLocaleString('vi-VN')} ký tự.`);
    }
    let subject = '';
    if (channel === 'email') {
      subject = toTrimmedString(raw.subject).replace(/\s+/g, ' ');
      if (!subject) throw bad('SUBJECT_REQUIRED', `${prefix}Vui lòng nhập tiêu đề email.`);
      if (subject.length > MAX_EMAIL_SUBJECT_LENGTH) {
        throw bad('SUBJECT_TOO_LONG', `${prefix}Tiêu đề email tối đa ${MAX_EMAIL_SUBJECT_LENGTH} ký tự.`);
      }
    }
    return { mode: 'custom', subject, body: text };
  }
  throw bad('INVALID_CONTENT', `${prefix}Vui lòng chọn dùng mẫu có sẵn hoặc tự soạn nội dung.`);
}

/** Số tin sau tối đa theo kênh: email/Zalo 9 (tổng 10 tin); Telegram/WhatsApp chung trần MAX_CHANNEL_STEPS = 5 tin của node gửi. */
function maxFollowUpsFor(channel) {
  return isAdapterCampaignChannel(channel) ? MAX_CHANNEL_STEPS - 1 : MAX_FOLLOW_UPS;
}

/**
 * Kênh adapter dùng được không: cờ hệ thống tắt → 400 CHANNEL_NOT_ENABLED; cờ bật nhưng gói của chủ workspace không có
 * (ngữ cảnh do `channelEntitlementContext` đặt) → 403 CHANNEL_NOT_IN_PLAN. Kênh khác: không làm gì.
 *
 * @param {string} channel
 */
function assertAdapterChannelUsable(channel) {
  if (!isAdapterCampaignChannel(channel) || isAdapterCampaignChannelEnabled(channel)) return;
  if (getChannelsBlockedByPlan().includes(channel)) {
    throw new SimpleCampaignError(403, 'CHANNEL_NOT_IN_PLAN', buildChannelNotInPlanMessage(channel), { missing: ['channel'] });
  }
  throw bad('CHANNEL_NOT_ENABLED', `Kênh ${ADAPTER_CHANNEL_NAMES[channel]} hiện chưa được bật.`);
}

/**
 * Kiểm + chuẩn hoá chuỗi tin tiếp theo (`followUps`, tin 2..N). Hàm thuần. Thiếu/null → [].
 *
 * @param {unknown} rawFollowUps
 * @param {'email'|'zalo'|'zalo_group'} channel
 * @returns {Array<{ delayValue: number, delayUnit: 'days'|'hours'|'minutes', content: object }>}
 */
function normalizeFollowUps(rawFollowUps, channel) {
  if (rawFollowUps == null) return [];
  if (!Array.isArray(rawFollowUps)) throw bad('INVALID_FOLLOW_UPS', 'Danh sách tin tiếp theo không hợp lệ.');
  const maxFollowUps = maxFollowUpsFor(channel);
  if (rawFollowUps.length > maxFollowUps) {
    throw bad('FOLLOW_UPS_TOO_MANY', `Chuỗi tin ${isAdapterCampaignChannel(channel) ? `${ADAPTER_CHANNEL_NAMES[channel]} ` : ''}tối đa ${maxFollowUps + 1} tin (tin đầu và ${maxFollowUps} tin tiếp theo).`);
  }
  return rawFollowUps.map((item, index) => {
    const prefix = `Tin ${index + 2}: `;
    const raw = item && typeof item === 'object' ? item : {};
    const rawDelay = typeof raw.delayValue === 'string' ? raw.delayValue.trim() : raw.delayValue;
    const delayValue = typeof rawDelay === 'number' || (typeof rawDelay === 'string' && rawDelay !== '') ? Number(rawDelay) : NaN;
    if (!Number.isInteger(delayValue) || delayValue <= 0 || delayValue > MAX_FOLLOW_UP_DELAY_VALUE) {
      throw bad('INVALID_FOLLOW_UP_DELAY', `${prefix}Thời gian chờ phải là số nguyên lớn hơn 0.`);
    }
    const delayUnit = toTrimmedString(raw.delayUnit);
    if (!FOLLOW_UP_DELAY_UNITS.includes(delayUnit)) {
      throw bad('INVALID_FOLLOW_UP_DELAY', `${prefix}Đơn vị chờ chỉ có thể là ngày, giờ hoặc phút.`);
    }
    // Kênh adapter: preflight chặn độ trễ một bước quá 30 ngày (channelSteps.util.js) — báo sớm ở đây thay vì lúc bấm chạy.
    if (isAdapterCampaignChannel(channel) && resolveStepDelayMs({ delayValue, delayUnit }) > MAX_STEP_DELAY_MS) {
      throw bad('INVALID_FOLLOW_UP_DELAY', `${prefix}Thời gian chờ tối đa 30 ngày.`);
    }
    return { delayValue, delayUnit, content: normalizeStepContent(raw.content, channel, prefix) };
  });
}

/**
 * Kiểm + chuẩn hoá body của trình từng bước. KHÔNG ghi DB. Chỉ đọc DB ở một chỗ: quyền sở hữu biểu mẫu ("form"), và bỏ qua được
 * bằng `skipDbChecks` (đọc ngược một chiến dịch đã lưu để dựng lại đồ thị so khớp — không có gì để hỏi người dùng).
 * Nguồn "Khách hàng đã lưu" KHÔNG còn lấy danh sách lúc tạo: là khối động `interested_customers` loại `all` (đọc lại mỗi lượt chạy).
 *
 * @param {object} body
 * @param {{ ownerId: number, now?: Date, skipDbChecks?: boolean }} context
 * @returns {Promise<{
 *   campaignName: string,
 *   channel: 'email'|'zalo'|'zalo_group',
 *   senderId: number,
 *   audience: object,
 *   content: { mode: 'template', templateId: number } | { mode: 'custom', subject: string, body: string },
 *   followUps: Array<{ delayValue: number, delayUnit: 'days'|'hours'|'minutes', content: object }>,
 *   directRecipients: { emails?: string[], phones?: string[], uids?: string[] }|null,
 *   recipientCountHint: number|null,
 * }>}
 */
export async function normalizeSimpleBody(body, { ownerId, now = new Date(), skipDbChecks = false }) {
  const source = body && typeof body === 'object' ? body : {};

  const channel = toTrimmedString(source.channel);
  if (!SIMPLE_CHANNELS.includes(channel)) {
    throw bad('INVALID_CHANNEL', 'Kênh gửi không hợp lệ. Chỉ hỗ trợ Email, Zalo cá nhân, Zalo nhóm, Telegram và WhatsApp.');
  }
  assertAdapterChannelUsable(channel);

  // WhatsApp không có id số: tài khoản gửi là MÃ PHIÊN chuỗi (`senderKey`, dạng `<id chủ>-<tên>`). Kênh khác dùng `senderId` số.
  let senderId = null;
  let senderKey = null;
  if (channel === 'whatsapp') {
    senderKey = toTrimmedString(source.senderKey);
    if (!senderKey) throw bad('SENDER_REQUIRED', 'Vui lòng chọn tài khoản gửi.');
    if (!WHATSAPP_SESSION_KEY_PATTERN.test(senderKey)) throw bad('SENDER_INVALID', 'Tài khoản WhatsApp không hợp lệ.');
  } else {
    senderId = toPositiveInt(source.senderId);
    if (!senderId) throw bad('SENDER_REQUIRED', 'Vui lòng chọn tài khoản gửi.');
  }

  let campaignName = toTrimmedString(source.campaignName);
  if (campaignName.length > MAX_CAMPAIGN_NAME_LENGTH) {
    throw bad('CAMPAIGN_NAME_TOO_LONG', `Tên chiến dịch tối đa ${MAX_CAMPAIGN_NAME_LENGTH} ký tự.`);
  }
  if (!campaignName) campaignName = buildDefaultCampaignName(channel, now);

  const rawAudience = source.audience && typeof source.audience === 'object' ? source.audience : {};
  const type = toTrimmedString(rawAudience.type);
  if (!SIMPLE_AUDIENCE_TYPES_BY_CHANNEL[channel].includes(type)) {
    throw bad('INVALID_AUDIENCE', 'Nguồn người nhận không phù hợp với kênh đã chọn.');
  }

  const audience = { type };
  let directRecipients = null;
  let recipientCountHint = null;

  if (type === 'customers') {
    // Khối động: không có danh sách, không đếm lúc tạo (preview tự đếm tổng khách của workspace).
  } else if (type === 'landing') {
    const slugs = toStringList(rawAudience.slugs)
      .map((slug) => slug.toLowerCase().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    if (slugs.length === 0) throw bad('LANDING_REQUIRED', 'Vui lòng chọn ít nhất một landing page.');
    if (slugs.length > MAX_LANDING_SLUGS) throw bad('LANDING_TOO_MANY', `Chỉ chọn tối đa ${MAX_LANDING_SLUGS} landing page.`);
    audience.slugs = [...new Set(slugs)];
  } else if (type === 'form') {
    const formIds = normalizeFormIdList(rawAudience.formIds);
    if (formIds.length === 0) throw bad('FORM_REQUIRED', 'Vui lòng chọn ít nhất một biểu mẫu.');
    if (!skipDbChecks) {
      const owned = new Set(await aiCampaignRepository.getFormIdsOwnedBy(ownerId, formIds));
      if (formIds.some((id) => !owned.has(id))) {
        throw bad('FORM_NOT_FOUND', 'Có biểu mẫu không tồn tại hoặc không thuộc tài khoản của bạn.');
      }
    }
    audience.formIds = formIds;
  } else if (type === 'sheet') {
    const sheetUrl = toTrimmedString(rawAudience.sheetUrl);
    if (!sheetUrl || !extractSpreadsheetId(sheetUrl)) {
      throw bad('SHEET_URL_INVALID', 'Link Google Sheet không hợp lệ. Hãy dán đúng link dạng docs.google.com/spreadsheets/d/….');
    }
    audience.sheetUrl = sheetUrl;
    const sheetName = toTrimmedString(rawAudience.sheetName);
    if (sheetName) audience.sheetName = sheetName.slice(0, 255);
  } else if (type === 'manual') {
    // validateManualRecipients ném 400 (INVALID_MANUAL_RECIPIENTS / MANUAL_RECIPIENTS_REQUIRED / MANUAL_RECIPIENTS_LIMIT) có sẵn thông điệp.
    const checked = channel === 'email'
      ? validateManualRecipients({ emails: rawAudience.emails })
      : validateManualRecipients({ phones: rawAudience.phones });
    directRecipients = channel === 'email' ? { emails: checked.emails } : { phones: checked.phones };
    recipientCountHint = (channel === 'email' ? checked.emails : checked.phones).length;
  } else if (type === 'zalo_friends') {
    const checked = validateManualRecipients({ uids: rawAudience.uids });
    directRecipients = { uids: checked.uids };
    recipientCountHint = checked.uids.length;
  } else if (type === 'conversations') {
    // Telegram/WhatsApp: mọi người đã từng nhắn tới tài khoản gửi (đọc lại mỗi lượt chạy) — không có danh sách nào để nhập/đếm lúc tạo.
  } else if (type === 'zalo_groups') {
    // groupIds rỗng = gửi MỌI nhóm của tài khoản (bộ biên dịch không chặn) → bắt buộc ≥ 1 nhóm.
    const groupIds = toStringList(rawAudience.groupIds);
    if (groupIds.length === 0) throw bad('ZALO_GROUPS_REQUIRED', 'Vui lòng chọn ít nhất một nhóm Zalo để gửi.');
    if (groupIds.length > MAX_ZALO_GROUPS) throw bad('ZALO_GROUPS_TOO_MANY', `Chỉ chọn tối đa ${MAX_ZALO_GROUPS} nhóm Zalo.`);
    audience.groupIds = groupIds;
    recipientCountHint = groupIds.length;
  } else if (type === 'telegram_groups' || type === 'whatsapp_groups') {
    // Danh sách nhóm rỗng = không có ai để gửi (bộ chạy kênh không có "mọi nhóm") → bắt buộc ≥ 1 nhóm.
    const label = ADAPTER_GROUP_LABEL[type];
    const rawGroups = Array.isArray(rawAudience.groups) ? rawAudience.groups : [];
    const groups = [];
    const seen = new Set();
    for (const item of rawGroups) {
      const recipientKey = toTrimmedString(item && typeof item === 'object' ? item.recipientKey : item);
      if (!recipientKey) continue;
      if (!ADAPTER_GROUP_KEY_PATTERN[type].test(recipientKey)) {
        throw bad('GROUPS_INVALID', `Có nhóm ${label} không hợp lệ.`);
      }
      if (seen.has(recipientKey)) continue;
      seen.add(recipientKey);
      groups.push({ recipientKey, display: toTrimmedString(item.display).slice(0, 255) || recipientKey });
    }
    if (groups.length === 0) throw bad('GROUPS_REQUIRED', `Vui lòng chọn ít nhất một nhóm ${label} để gửi.`);
    if (groups.length > MAX_ADAPTER_GROUPS) throw bad('GROUPS_TOO_MANY', `Chỉ chọn tối đa ${MAX_ADAPTER_GROUPS} nhóm ${label}.`);
    audience.groups = groups;
    recipientCountHint = groups.length;
  }

  const content = normalizeStepContent(source.content, channel);
  const followUps = normalizeFollowUps(source.followUps, channel);
  // Loại chiến dịch lưu DB: nhóm Telegram dùng `telegram_group` như trình dựng (danh sách chiến dịch hiện đúng nhãn). WhatsApp nhóm
  // KHÔNG có loại riêng (enum chỉ có `whatsapp`; trình dựng cũng lưu nguồn nhóm trong cấu hình khối `send_whatsapp`).
  const campaignType = type === 'telegram_groups' ? 'telegram_group' : channel;

  return { campaignName, channel, campaignType, senderId, senderKey, audience, content, followUps, directRecipients, recipientCountHint };
}

function buildIntentSender(channel, senderId, senderKey) {
  if (channel === 'telegram') return { type: 'telegram_account', id: senderId };
  if (channel === 'whatsapp') return { type: 'whatsapp_session', sessionKey: senderKey };
  return { type: channel === 'email' ? 'email_account' : 'zalo_account', id: senderId };
}

/**
 * Dựng `CampaignIntentV1` từ body đã chuẩn hoá — bảng ánh xạ ở plan §PR-1. Hàm thuần.
 * "Khách hàng đã lưu" dùng audience `db` → khối động `interested_customers` loại `all` (toàn bộ khách workspace, trần 50.000, đọc lại
 * mỗi lượt chạy — PLAN_TAO_CHIEN_DICH PR-5). Có `followUps` → lịch `drip` (tin 1 + N tin, mỗi ngày 1 tin; độ trễ thật ghi đè ở
 * `compileSimpleGraph`).
 *
 * @param {Awaited<ReturnType<typeof normalizeSimpleBody>>} input
 * @returns {object} CampaignIntentV1
 */
export function buildSimpleIntent(input) {
  const { channel, senderId, senderKey, audience } = input;
  const followUps = Array.isArray(input.followUps) ? input.followUps : [];
  const recipientKind = channel === 'email' ? 'email' : 'phone';

  let intentAudience;
  switch (audience.type) {
    case 'customers':
      intentAudience = { type: 'db', recipientKind };
      break;
    case 'manual':
      intentAudience = { type: 'manual', recipientKind };
      break;
    case 'landing':
      intentAudience = { type: 'landing', slugs: audience.slugs };
      break;
    case 'form':
      intentAudience = { type: 'form', formIds: audience.formIds };
      break;
    case 'sheet':
      intentAudience = { type: 'sheet', url: audience.sheetUrl };
      break;
    case 'zalo_friends':
      intentAudience = { type: 'zalo_contacts', friendIds: input.directRecipients?.uids || [] };
      break;
    case 'zalo_groups':
      intentAudience = { type: 'manual', groupIds: audience.groupIds };
      break;
    case 'conversations':
      intentAudience = { type: 'conversations' };
      break;
    case 'telegram_groups':
    case 'whatsapp_groups':
      intentAudience = { type: audience.type, groups: audience.groups };
      break;
    default:
      throw bad('INVALID_AUDIENCE', 'Nguồn người nhận không hợp lệ.');
  }

  return {
    version: 1,
    channel,
    sender: buildIntentSender(channel, senderId, senderKey),
    audience: intentAudience,
    schedule: followUps.length > 0 ? { type: 'drip', days: 1 + followUps.length, slotsPerDay: 1 } : { type: 'once' },
  };
}

/** Khối gửi + tên trường bước theo kênh. */
const SEND_NODE_BY_CHANNEL = Object.freeze({
  email: { subtype: 'send_email', stepsField: 'emailSteps' },
  zalo: { subtype: 'send_zalo_personal', stepsField: 'zaloPersonalTemplateSteps' },
  zalo_group: { subtype: 'send_zalo_group', stepsField: 'zaloGroupTemplateSteps' },
  telegram: { subtype: 'send_telegram', stepsField: 'steps' },
  whatsapp: { subtype: 'send_whatsapp', stepsField: 'steps' },
});

/**
 * Gán nội dung từng tin lên các bước của khối gửi (sửa tại chỗ trên đồ thị vừa biên dịch).
 *  - mẫu có sẵn → `templateId`;
 *  - tự soạn → `applySlotsToGraph` đúng `slotId` của bước (email bắt buộc tiêu đề cho MỌI tin tự soạn).
 * `applySlotsToGraph` luôn chạy `assertNoEmptyContent` trên MỌI bước của khối gửi — bước dùng mẫu (không có `message`) sẽ bị từ
 * chối. Nên bước dùng mẫu được điền chữ giữ chỗ trong lúc áp, rồi trả về rỗng + gắn `templateId` ngay sau đó.
 */
function applyStepContents({ compiled, nodes, connections, channel, contents }) {
  const { subtype, stepsField } = SEND_NODE_BY_CHANNEL[channel];
  const sendNodeOf = (list) => list.find((node) => getNodeSubtype(node) === subtype);
  const stepsOf = (list) => sendNodeOf(list)?.config?.[stepsField];

  const steps = stepsOf(nodes);
  if (!Array.isArray(steps) || steps.length !== contents.length || contents.some((_, index) => !steps[index])) {
    throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
  }

  const customSlots = [];
  const customContentSlots = [];
  contents.forEach((content, index) => {
    if (content.mode !== 'custom') return;
    const slot = compiled.contentSlots?.[index];
    if (!slot) throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
    customContentSlots.push(slot);
    customSlots.push({ slotId: slot.slotId, message: content.body, subject: content.subject });
  });

  let resultNodes = nodes;
  let resultConnections = connections;
  if (customSlots.length > 0) {
    const working = JSON.parse(JSON.stringify(nodes));
    const workingSteps = stepsOf(working);
    contents.forEach((content, index) => {
      if (content.mode === 'custom') return;
      if (channel === 'email') {
        workingSteps[index].emailSubject = TEMPLATE_STEP_PLACEHOLDER;
        workingSteps[index].emailBody = TEMPLATE_STEP_PLACEHOLDER;
      } else {
        workingSteps[index].message = TEMPLATE_STEP_PLACEHOLDER;
      }
    });
    try {
      ({ script: { nodes: resultNodes, connections: resultConnections } } = applySlotsToGraph(
        { ...compiled, nodes: working, connections, contentSlots: customContentSlots },
        customSlots,
      ));
    } catch (error) {
      throw bad('INVALID_CONTENT', error?.message || 'Nội dung tin nhắn không hợp lệ.');
    }
  }

  const finalSteps = stepsOf(resultNodes);
  contents.forEach((content, index) => {
    if (content.mode !== 'template') return;
    const step = finalSteps[index];
    step.templateId = content.templateId;
    if (channel === 'email') {
      step.emailSubject = '';
      step.emailBody = '';
    } else {
      step.message = '';
    }
  });
  return { nodes: resultNodes, connections: resultConnections };
}

/**
 * Telegram/WhatsApp: gán nội dung từng tin lên `config.steps` của khối gửi.
 *
 * Bộ chạy kênh adapter (`campaignChannelRunner`) chỉ đọc `step.message` + `step.attachments` — KHÔNG tra `templateId` lúc gửi. Vì vậy
 * mẫu có sẵn được CHÉP nội dung + tệp vào bước ngay lúc tạo (y hệt `applyTemplateToStep` của trình dựng: sửa mẫu về sau không đổi
 * chiến dịch đã tạo); `templateId` giữ lại để thẻ xác nhận kiểm mẫu còn tồn tại. Chữ tự soạn ghi thẳng vào `message` — không cần tạo
 * mẫu tin và không qua AI.
 *
 * @param {{ nodes: object[], channel: 'telegram'|'whatsapp', contents: object[], ownerId: number }} args
 */
async function applyAdapterStepContents({ nodes, channel, contents, ownerId }) {
  const { subtype, stepsField } = SEND_NODE_BY_CHANNEL[channel];
  const steps = nodes.find((node) => getNodeSubtype(node) === subtype)?.config?.[stepsField];
  if (!Array.isArray(steps) || steps.length !== contents.length) {
    throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
  }
  const maxLength = MAX_CUSTOM_BODY_LENGTH[channel];
  const imageExtensions = channel === 'telegram' ? TELEGRAM_PHOTO_EXTENSIONS : WHATSAPP_IMAGE_EXTENSIONS;

  for (let index = 0; index < contents.length; index += 1) {
    const content = contents[index];
    const step = steps[index];
    const prefix = contents.length > 1 ? `Tin ${index + 1}: ` : '';
    if (content.mode === 'custom') {
      step.message = content.body;
      continue;
    }

    // Mẫu có sẵn (kho mẫu dùng chung với Zalo, lọc theo chủ workspace).
    // eslint-disable-next-line no-await-in-loop
    const template = await zaloTemplateRepository.findById({ id: content.templateId, userId: ownerId, isAdmin: false });
    step.templateId = content.templateId;
    if (!template) {
      // Để trống: thẻ xác nhận báo `template_not_found` (đúng đường email/Zalo), người dùng thấy câu tiếng Việt thay vì lỗi 500.
      step.message = '';
      continue;
    }
    const message = typeof template.body_text === 'string' ? template.body_text.trim() : '';
    const attachments = Array.isArray(template.attachments) ? template.attachments.filter(Boolean) : [];
    if (!message && attachments.length === 0) {
      throw bad('CONTENT_REQUIRED', `${prefix}Mẫu tin này chưa có nội dung nào để gửi.`);
    }
    if (message.length > maxLength) {
      throw bad('CONTENT_TOO_LONG', `${prefix}Nội dung mẫu dài quá ${maxLength.toLocaleString('vi-VN')} ký tự nên ${ADAPTER_CHANNEL_NAMES[channel]} không gửi được.`);
    }
    try {
      assertAttachmentListWithinLimits(attachments, imageExtensions);
    } catch (limitError) {
      throw bad('CHANNEL_ATTACHMENT_LIMIT', `${prefix}${limitError.message}`);
    }
    step.message = message;
    if (attachments.length > 0) step.attachments = attachments;
  }
}

/**
 * Biên dịch body → đồ thị chiến dịch (chưa prepare): intent → (landing → form) → isCompilableIntent → compileCampaign →
 * (chuỗi tin: ghi đè độ trễ từng bước) → gắn nội dung. Không chạm DB trừ bước tra landing → biểu mẫu.
 *
 * Chuỗi tin: `buildSimpleIntent` dựng lịch `drip` mỗi ngày 1 tin, bộ biên dịch đặt độ trễ 1 ngày mỗi bước; ở đây ghi đè bằng độ trễ
 * thật của người dùng. Bước 0: `delayValue: 0`. Bước i ≥ 1: `delayFrom: 'prev'` (BẮT BUỘC — thiếu thì runtime coi là 'start' và mọi bước
 * sau cùng đến hạn một lúc, xem `computeDripStepDelay` ở campaignCompiler.service.js).
 *
 * @returns {Promise<{ nodes: object[], connections: object[] }>}
 */
export async function compileSimpleGraph(input, { ownerId }) {
  const intent = await applyLandingAudienceResolution(buildSimpleIntent(input), ownerId);

  const check = isCompilableIntent(intent);
  if (!check.ok) {
    // Với 3 kênh đã kiểm ở normalizeSimpleBody, `channel` chỉ khuyết khi gói không có kênh Zalo (đọc từ ngữ cảnh do
    // channelEntitlementContext đặt — thiếu middleware này thì chốt chặn gói im lặng mất).
    if (check.missing.includes('channel') && input.channel !== 'email') {
      assertAdapterChannelUsable(input.channel);
      throw new SimpleCampaignError(
        403,
        'CHANNEL_NOT_IN_PLAN',
        buildChannelNotInPlanMessage(isAdapterCampaignChannel(input.channel) ? input.channel : 'zalo'),
        { missing: check.missing },
      );
    }
    throw bad('INTENT_INCOMPLETE', 'Thông tin chiến dịch chưa đầy đủ.', { missing: check.missing });
  }
  const compiled = compileCampaign(intent);

  const followUps = Array.isArray(input.followUps) ? input.followUps : [];
  const contents = [input.content, ...followUps.map((item) => item.content)];

  const { stepsField, subtype } = SEND_NODE_BY_CHANNEL[input.channel];
  const compiledSteps = compiled.nodes.find((node) => getNodeSubtype(node) === subtype)?.config?.[stepsField];
  if (!Array.isArray(compiledSteps) || compiledSteps.length !== contents.length) {
    throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
  }
  // Kênh adapter: bước sau LUÔN chờ kể từ bước trước (hợp đồng `channelSteps.util.js`), không có `delayFrom` và bước đầu không có trường trễ —
  // giữ đúng hình dạng trình dựng lưu để runner/preflight đọc như nhau.
  const isAdapter = isAdapterCampaignChannel(input.channel);
  compiledSteps.forEach((step, index) => {
    if (index === 0) {
      if (!isAdapter) step.delayValue = 0;
      return;
    }
    const followUp = followUps[index - 1];
    step.delayValue = followUp.delayValue;
    step.delayUnit = followUp.delayUnit;
    if (!isAdapter) step.delayFrom = 'prev';
  });

  let nodes;
  let connections;
  if (isAdapter) {
    await applyAdapterStepContents({ nodes: compiled.nodes, channel: input.channel, contents, ownerId });
    ({ nodes, connections } = compiled);
  } else {
    ({ nodes, connections } = applyStepContents({
      compiled,
      nodes: compiled.nodes,
      connections: compiled.connections,
      channel: input.channel,
      contents,
    }));
  }

  if (input.audience.type === 'sheet' && input.audience.sheetName) {
    const sheetNode = nodes.find((node) => getNodeSubtype(node) === 'read_sheet');
    if (sheetNode) sheetNode.config = { ...(sheetNode.config || {}), sheetName: input.audience.sheetName };
  }

  return { nodes, connections };
}

/** Tài khoản gửi sau prepareScript còn đúng tài khoản đã chọn không (nhân viên chưa được giao thì prepareScript gỡ id đi). */
function senderSurvivedPrepare(nodes, channel, senderId, senderKey = null) {
  if (channel === 'whatsapp') {
    return nodes
      .filter((node) => getNodeSubtype(node) === 'send_whatsapp')
      .every((node) => String(node.config?.whatsappSessionKey ?? '') === senderKey);
  }
  const key = { email: 'fromEmailId', telegram: 'telegramAccountId' }[channel] || 'zaloAccountId';
  const subtypes = channel === 'email'
    ? ['send_email']
    : (channel === 'telegram' ? ['send_telegram'] : ['select_zalo_account', 'send_zalo_personal', 'send_zalo_group']);
  return nodes
    .filter((node) => subtypes.includes(getNodeSubtype(node)))
    .every((node) => Number(node.config?.[key]) === senderId);
}

/**
 * Trường TUỲ CHỌN của preview để ước tính theo cách gửi (PLAN_TAO_CHIEN_DICH_TUNG_BUOC PR-3): `startAt` (ISO, giờ hẹn / lần
 * lặp kế tiếp) và `continuous: true` (tự gửi cho người mới). Sai định dạng thì bỏ qua (ước tính như "gửi ngay"), không 400:
 * đây chỉ là gợi ý hiển thị, quá khứ đã được bộ ước tính tự kẹp về "bây giờ".
 *
 * @param {object} body body preview
 * @returns {{ startAt: Date|null, continuous: boolean }}
 */
export function resolvePreviewEstimateOptions(body) {
  const rawStartAt = body && typeof body === 'object' ? body.startAt : null;
  let startAt = null;
  if (typeof rawStartAt === 'string' && rawStartAt.trim()) {
    const parsed = new Date(rawStartAt.trim());
    if (!Number.isNaN(parsed.getTime())) startAt = parsed;
  }
  return { startAt, continuous: body?.continuous === true };
}

/**
 * Dựng bản nháp ĐÃ KIỂM từ body (bước 1–5 của plan, KHÔNG ghi DB): chuẩn hoá → biên dịch → gắn nội dung → prepareScript →
 * người nhận nhập sẵn → điền tên tab Sheet → thẻ xác nhận → validateNodeConfig từng node.
 *
 * @param {{ body: object, authUser: object, includeEstimate?: boolean, estimateOptions?: { startAt?: Date|null, continuous?: boolean }|null, now?: Date }} input
 * @returns {Promise<{
 *   input: Awaited<ReturnType<typeof normalizeSimpleBody>>,
 *   ownerId: number,
 *   script: object,
 *   view: object,
 *   issues: Array<object>,
 * }>}
 */
export async function buildSimpleDraft({ body, authUser, includeEstimate = false, estimateOptions = null, now = new Date() }) {
  const ownerId = getWorkspaceContext(authUser).workspaceOwnerId;
  const input = await normalizeSimpleBody(body, { ownerId, now });
  const { nodes, connections } = await compileSimpleGraph(input, { ownerId });

  // `compilerApplied: true` để prepareScript bỏ qua 11 nhánh [AI Patch] cũ (graph đến từ compiler, không phải LLM).
  const script = {
    campaignName: input.campaignName,
    description: '',
    campaignType: input.campaignType || input.channel,
    nodes,
    connections,
    compilerApplied: true,
  };
  const prepared = await aiCampaignDraftService.prepareScript(script, authUser.id, { ownerUserId: ownerId });
  if (input.directRecipients) applyDirectRecipients(prepared, input.directRecipients);

  // Điền tên tab đầu tiên cho Sheet (timeout ngắn, lỗi → để trống) TRƯỚC thẻ xác nhận để ước tính đếm được người nhận.
  await fillReadSheetFirstTabNames(prepared.nodes);

  const view = await campaignConfirmationService.buildConfirmationView({
    script: prepared,
    userId: authUser.id,
    ownerUserId: ownerId,
    includeEstimate,
    estimateOptions,
  });

  const issues = [];
  const pushIssue = ({ code, nodeId = null, stepIndex = null, messageOverride = null }) => {
    if (issues.some((item) => item.code === code && item.nodeId === nodeId && item.stepIndex === stepIndex)) return;
    const info = ISSUE_INFO[code] || { apiCode: 'INVALID_DRAFT_RESOURCES', message: 'Chiến dịch chưa hợp lệ.' };
    issues.push({
      code,
      apiCode: info.apiCode,
      nodeId,
      stepIndex,
      severity: 'blocking',
      messageKey: `aiChatbot.confirmation.${code}`,
      message: messageOverride || info.message,
    });
  };
  for (const issue of view.blockingIssues || []) pushIssue(issue);
  // prepareScript gỡ tài khoản Zalo chưa giao cho nhân viên rồi thẻ xác nhận có thể rơi về "mặc định được giao" nên không báo lỗi;
  // so lại với tài khoản đã chọn để chặn gửi bằng tài khoản khác âm thầm.
  if (!senderSurvivedPrepare(prepared.nodes, input.channel, input.senderId, input.senderKey) && !issues.some((item) => item.code === 'missing_sender')) {
    pushIssue({ code: 'missing_sender' });
  }

  // Chỉ kiểm cấu hình node khi chưa có vấn đề nào ở trên: thiếu tài khoản gửi/mẫu tin kéo theo "trường bắt buộc" của node
  // (cùng một nguyên nhân) — báo thêm sẽ chỉ nhân đôi lỗi cho người dùng.
  if (issues.length === 0) {
    for (const node of prepared.nodes) {
      const validation = campaignNodeRegistryService.validateNodeConfig(getNodeSubtype(node), node.config || {});
      if (!validation.valid) {
        pushIssue({ code: 'invalid_node_config', nodeId: String(node.id || node.tempId || ''), messageOverride: validation.errors.join(', ') });
      }
    }
  }

  return { input, ownerId, script: prepared, view, issues };
}

/** Tên hiển thị của nội dung cho thẻ tóm tắt. */
function describeContent(input, view) {
  const content = view?.steps?.[0]?.content;
  if (input.content.mode === 'template') return content?.templateName || null;
  if (input.channel === 'email') return input.content.subject || null;
  return (content?.bodyText || input.content.body).slice(0, 60);
}

/** Tên hiển thị của nguồn người nhận cho thẻ tóm tắt (null khi là danh sách nhập sẵn — trình duyệt tự ghi "N người"). */
function describeAudience(input, view) {
  const recipients = view?.steps?.[0]?.recipients;
  if (!recipients) return null;
  if (recipients.landing?.pages?.length) {
    return recipients.landing.pages.map((page) => page.title || page.slug).join(', ');
  }
  return recipients.sourceLabel || null;
}

/** Hạn mức chiến dịch theo loại — cùng bảng với `campaignController.create` (campaign.controller.js). */
const CAMPAIGN_TYPE_RESOURCE_KEY = Object.freeze({
  email: 'emailCampaigns',
  zalo: 'zaloCampaigns',
  zalo_group: 'zaloGroupCampaigns',
});

/**
 * Hạn mức tạo chiến dịch của gói (tổng + theo loại), kiểm Y HỆT `campaignController.create`. Hết hạn mức → issue chặn để màn
 * Xem lại báo TRƯỚC khi bấm gửi (review 17/10: trước đó preview báo "sẵn sàng" rồi bấm gửi mới nhận 400 "đã đạt giới hạn").
 *
 * @param {object} authUser
 * @param {'email'|'zalo'|'zalo_group'} channel
 * @returns {Promise<object|null>} issue hoặc null khi còn hạn mức
 */
async function findCampaignLimitIssue(authUser, channel) {
  const { workspaceOwnerId, roleCode } = getWorkspaceContext(authUser);
  // Telegram/WhatsApp không có hạn mức số chiến dịch riêng theo loại (campaignCrud.service.js) → chỉ trần `campaigns` chung.
  for (const resourceKey of ['campaigns', CAMPAIGN_TYPE_RESOURCE_KEY[channel]].filter(Boolean)) {
    const check = await checkUserResourceLimit({ userId: workspaceOwnerId, roleCode, resourceKey });
    if (!check.allowed) {
      return {
        code: 'campaign_limit_reached',
        apiCode: 'CAMPAIGN_LIMIT_REACHED',
        nodeId: null,
        stepIndex: null,
        severity: 'blocking',
        messageKey: 'simpleCampaign.issues.campaign_limit_reached',
        message: check.message || 'Tài khoản đã đạt giới hạn số chiến dịch của gói.',
      };
    }
  }
  return null;
}

/**
 * `POST /campaigns/simple/preview` — bước 1–5, KHÔNG ghi DB (không tạo mẫu tin, không tạo chiến dịch).
 * Lỗi dữ liệu (thiếu tài khoản, mẫu không tìm thấy, Sheet không đọc được…) trả về trong `issues`, không phải 500.
 * Body sai hình dạng (kênh lạ, nhóm Zalo rỗng, quá trần…) ném `SimpleCampaignError` 400.
 *
 * @param {{ body: object, authUser: object, now?: Date }} input
 * @returns {Promise<{
 *   readyToCreate: boolean,
 *   issues: Array<object>,
 *   estimate: object|null,
 *   recipientCount: number|null,
 *   recipientUnit: 'person'|'group',
 *   summary: { channel: string, senderLabel: string|null, audienceType: string, audienceLabel: string|null, contentLabel: string|null },
 * }>}
 */
export async function previewSimpleCampaign({ body, authUser, now = new Date() }) {
  const { input, ownerId, view, issues } = await buildSimpleDraft({
    body,
    authUser,
    includeEstimate: true,
    estimateOptions: resolvePreviewEstimateOptions(body),
    now,
  });
  const estimate = view.estimate || null;

  const limitIssue = await findCampaignLimitIssue(authUser, input.channel);
  const blockingIssues = limitIssue ? [...issues, limitIssue] : issues;
  const issuesOut = [...blockingIssues];
  const unknownCount = (estimate?.warnings || []).some((warning) => warning.code === 'recipient_count_unknown');
  // Telegram/WhatsApp nguồn "người đã nhắn": thẻ xác nhận đã đếm hội thoại đang mở của tài khoản (null = đếm lỗi → không bịa số).
  let countHint = input.recipientCountHint;
  if (countHint == null && input.audience.type === 'conversations') {
    const openConversations = view.steps?.[0]?.recipients?.conversations?.count;
    if (Number.isInteger(openConversations)) countHint = openConversations;
  }
  // Đã biết chắc số người nhận (danh sách nhập sẵn / khách đã lưu / số nhóm Zalo) thì không báo "chưa đếm được": bộ ước tính
  // không đếm thành viên nhóm Zalo nên luôn trả cảnh báo này cho Zalo nhóm dù câu tóm tắt đã nói "1 nhóm" (thử prod 17/10).
  if (unknownCount && countHint == null && input.audience.type !== 'customers') {
    issuesOut.push({
      code: 'recipient_count_unknown',
      apiCode: 'RECIPIENT_COUNT_UNKNOWN',
      nodeId: null,
      stepIndex: null,
      severity: 'warning',
      messageKey: 'campaignEstimate.warnings.recipient_count_unknown',
      message: 'Chưa đếm được số người nhận (nguồn dữ liệu không đọc được hoặc phản hồi quá chậm). Bạn vẫn có thể tạo chiến dịch.',
    });
  }

  // "Khách hàng đã lưu" là khối động: không có danh sách, chỉ có tổng khách của workspace. Khối chỉ đọc tối đa 50.000 khách đầu tiên.
  let customersTotal = null;
  if (input.audience.type === 'customers') {
    customersTotal = await customerReadRepository.countWorkspaceCustomers({ userId: ownerId });
    if (customersTotal > ALL_CUSTOMERS_LIMIT_CAP) {
      issuesOut.push({
        code: 'customers_over_limit',
        apiCode: 'CUSTOMERS_OVER_LIMIT',
        nodeId: null,
        stepIndex: null,
        severity: 'warning',
        messageKey: 'simpleCampaign.issues.customers_over_limit',
        message: `Chỉ gửi cho ${ALL_CUSTOMERS_LIMIT_CAP.toLocaleString('vi-VN')} khách đầu tiên (bạn có ${customersTotal.toLocaleString('vi-VN')} khách).`,
      });
    } else if (customersTotal === 0) {
      issuesOut.push({
        code: 'customers_empty',
        apiCode: 'CUSTOMERS_EMPTY',
        nodeId: null,
        stepIndex: null,
        severity: 'warning',
        messageKey: 'simpleCampaign.issues.customers_empty',
        message: 'Hiện chưa có khách hàng nào trong danh sách đã lưu. Chiến dịch sẽ gửi cho khách được thêm vào sau.',
      });
    }
  }

  let recipientCount = input.audience.type === 'customers'
    ? Math.min(customersTotal, ALL_CUSTOMERS_LIMIT_CAP)
    : countHint;
  if (recipientCount == null && estimate && !unknownCount) {
    recipientCount = (estimate.perNode || []).reduce((sum, node) => sum + (Number(node.recipients) || 0), 0);
  }

  if (input.audience.type === 'conversations' && countHint === 0) {
    issuesOut.push({
      code: 'conversations_empty',
      apiCode: 'CONVERSATIONS_EMPTY',
      nodeId: null,
      stepIndex: null,
      severity: 'warning',
      messageKey: 'simpleCampaign.issues.conversations_empty',
      message: 'Tài khoản này chưa có ai nhắn tới nên hiện chưa có người nhận. Gửi ngay bây giờ sẽ không có tin nào được gửi.',
    });
  }

  return {
    readyToCreate: blockingIssues.length === 0,
    issues: issuesOut,
    estimate,
    recipientCount: recipientCount ?? null,
    recipientUnit: input.channel === 'zalo_group' || input.audience.type === 'telegram_groups' || input.audience.type === 'whatsapp_groups' ? 'group' : 'person',
    summary: {
      channel: input.channel,
      senderLabel: view.steps?.[0]?.sender?.label || null,
      audienceType: input.audience.type,
      audienceLabel: describeAudience(input, view),
      contentLabel: describeContent(input, view),
    },
  };
}

/**
 * Bản nháp sẵn sàng TẠO: như `buildSimpleDraft` nhưng mọi vấn đề chặn đều ném 400, và chữ tự soạn được tạo thành mẫu tin
 * (bộ chạy chỉ gửi bước có `templateId` dạng số). Mẫu tạo ra đẩy vào `createdTemplates` — người gọi PHẢI gọi
 * `cleanupCreatedTemplates` nếu bước tạo chiến dịch sau đó thất bại.
 *
 * @param {{ body: object, authUser: object, createdTemplates: { emailTemplateIds: number[], zaloTemplateIds: number[] }, now?: Date }} input
 * @returns {Promise<{ ownerId: number, campaignName: string, channel: string, nodes: object[], connections: object[], recipientCountHint: number|null }>}
 */
export async function buildSimpleCreateDraft({ body, authUser, createdTemplates, now = new Date() }) {
  const { input, ownerId, script, issues } = await buildSimpleDraft({ body, authUser, includeEstimate: false, now });

  if (issues.length > 0) {
    const first = issues[0];
    throw new SimpleCampaignError(400, first.apiCode, first.message, {
      issues: issues.map(({ code, nodeId, stepIndex, message }) => ({ code, nodeId, stepIndex, message })),
    });
  }

  // Bất kỳ tin nào (tin 1 hoặc tin trong chuỗi) tự soạn đều phải thành mẫu — bộ chạy chỉ gửi bước có `templateId` dạng số.
  // Telegram/WhatsApp ghi chữ thẳng vào `step.message` (bộ chạy kênh adapter không tra mẫu) nên KHÔNG tạo mẫu tin.
  const hasCustomContent = !isAdapterCampaignChannel(input.channel)
    && [input.content, ...(input.followUps || []).map((item) => item.content)].some((item) => item.mode === 'custom');
  if (hasCustomContent) {
    // autoCreate* đặt tên mẫu theo `node.nodeName` (rơi về "Email/Zalo … từ AI"). Mượn tên chiến dịch để thư viện mẫu của khách không
    // hiện nhãn "từ AI" cho thứ họ tự gõ; xoá ngay sau đó để không lọt vào tên khối đã lưu.
    for (const node of script.nodes) {
      if (['send_email', 'send_zalo_personal', 'send_zalo_group'].includes(getNodeSubtype(node))) node.nodeName = input.campaignName;
    }
    await aiCampaignDraftService.autoCreateEmailTemplates(script.nodes, ownerId, createdTemplates);
    await aiCampaignDraftService.autoCreateZaloTemplates(script.nodes, ownerId, createdTemplates);
    for (const node of script.nodes) delete node.nodeName;
  }

  return {
    ownerId,
    campaignName: script.campaignName || input.campaignName,
    channel: input.channel,
    campaignType: input.campaignType || input.channel,
    nodes: script.nodes,
    connections: script.connections,
    recipientCountHint: input.recipientCountHint,
  };
}

/** Xoá mẫu tin vừa tạo khi tạo chiến dịch thất bại (repository xoá có lọc theo chủ). */
export async function cleanupCreatedTemplates(createdTemplates, ownerId) {
  await aiCampaignDraftService.cleanupAutoCreatedTemplates(createdTemplates, ownerId);
}

export default {
  normalizeSimpleBody,
  buildSimpleIntent,
  buildSimpleDraft,
  previewSimpleCampaign,
  buildSimpleCreateDraft,
  cleanupCreatedTemplates,
  buildDefaultCampaignName,
};
