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
import { buildChannelNotInPlanMessage } from './campaignChannelFlags.util.js';
import { applyDirectRecipients } from '../../utils/directRecipients.util.js';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../../utils/manualRecipients.util.js';
import { normalizeFormIdList } from '../../utils/campaignFormIds.util.js';
import { extractSpreadsheetId } from '../../utils/googleSheetWorksheets.util.js';
import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';
import { normalizeVietnamesePhone, isValidVietnamesePhone } from '../../utils/vietnamesePhone.util.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

/** Ba kênh của trình từng bước (v1). Telegram/WhatsApp ngoài phạm vi. */
export const SIMPLE_CHANNELS = Object.freeze(['email', 'zalo', 'zalo_group']);

/** Nguồn người nhận hợp lệ theo kênh (khớp bảng ở plan §2 bước 2). */
export const SIMPLE_AUDIENCE_TYPES_BY_CHANNEL = Object.freeze({
  email: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual']),
  zalo: Object.freeze(['customers', 'landing', 'form', 'sheet', 'manual', 'zalo_friends']),
  zalo_group: Object.freeze(['zalo_groups']),
});

const CHANNEL_LABELS = Object.freeze({ email: 'Email', zalo: 'Zalo cá nhân', zalo_group: 'Zalo nhóm' });
const MAX_CAMPAIGN_NAME_LENGTH = 255;
const MAX_LANDING_SLUGS = 50;
const MAX_ZALO_GROUPS = 500;
const MAX_CUSTOM_BODY_LENGTH = Object.freeze({ email: 100000, zalo: 4000, zalo_group: 4000 });
const MAX_EMAIL_SUBJECT_LENGTH = 150;
// Cùng quy tắc `validateManualRecipients` (manualRecipients.util.js) — lọc trước để một dòng khách lỗi không làm hỏng cả danh sách.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * Lấy mọi email/SĐT khách của workspace (nguồn "Khách hàng đã lưu"). Phạm vi workspace do repository lo (cùng
 * `GET /customers`). Quá trần `MAX_AI_MANUAL_RECIPIENTS` → 400 nói rõ con số; không có ai hợp lệ → 400.
 *
 * @param {{ ownerId: number, channel: 'email'|'zalo' }} input
 * @returns {Promise<string[]>} email (thường hoá) hoặc SĐT (đã chuẩn hoá), đã khử trùng
 */
async function loadCustomerContacts({ ownerId, channel }) {
  const kind = channel === 'email' ? 'email' : 'phone';
  const rows = await customerReadRepository.getCustomerContactValues({
    userId: ownerId,
    kind,
    limit: MAX_AI_MANUAL_RECIPIENTS + 1,
  });
  if (rows.length > MAX_AI_MANUAL_RECIPIENTS) {
    throw bad(
      'CUSTOMERS_OVER_LIMIT',
      `Danh sách khách hàng đã lưu vượt trần ${MAX_AI_MANUAL_RECIPIENTS.toLocaleString('vi-VN')} người nhận cho mỗi chiến dịch. Hãy chọn nguồn khác (biểu mẫu, landing page, Google Sheet) hoặc chia nhỏ danh sách.`,
      { limit: MAX_AI_MANUAL_RECIPIENTS },
    );
  }
  const seen = new Set();
  const contacts = [];
  for (const raw of rows) {
    const value = kind === 'email' ? String(raw || '').trim().toLowerCase() : normalizeVietnamesePhone(raw);
    const valid = kind === 'email' ? EMAIL_PATTERN.test(value) : isValidVietnamesePhone(value);
    if (!valid || seen.has(value)) continue;
    seen.add(value);
    contacts.push(value);
  }
  if (contacts.length === 0) {
    throw bad(
      'CUSTOMERS_EMPTY',
      kind === 'email'
        ? 'Chưa có khách hàng nào có email hợp lệ và còn nhận thư.'
        : 'Chưa có khách hàng nào có số điện thoại hợp lệ.',
    );
  }
  return contacts;
}

/**
 * Kiểm + chuẩn hoá body của trình từng bước. KHÔNG ghi DB. Có đọc DB ở hai chỗ: danh sách khách ("customers") và quyền sở hữu
 * biểu mẫu ("form").
 *
 * @param {object} body
 * @param {{ ownerId: number, now?: Date }} context
 * @returns {Promise<{
 *   campaignName: string,
 *   channel: 'email'|'zalo'|'zalo_group',
 *   senderId: number,
 *   audience: object,
 *   content: { mode: 'template', templateId: number } | { mode: 'custom', subject: string, body: string },
 *   directRecipients: { emails?: string[], phones?: string[], uids?: string[] }|null,
 *   recipientCountHint: number|null,
 * }>}
 */
export async function normalizeSimpleBody(body, { ownerId, now = new Date() }) {
  const source = body && typeof body === 'object' ? body : {};

  const channel = toTrimmedString(source.channel);
  if (!SIMPLE_CHANNELS.includes(channel)) {
    throw bad('INVALID_CHANNEL', 'Kênh gửi không hợp lệ. Chỉ hỗ trợ Email, Zalo cá nhân và Zalo nhóm.');
  }

  const senderId = toPositiveInt(source.senderId);
  if (!senderId) throw bad('SENDER_REQUIRED', 'Vui lòng chọn tài khoản gửi.');

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
    const contacts = await loadCustomerContacts({ ownerId, channel });
    directRecipients = channel === 'email' ? { emails: contacts } : { phones: contacts };
    recipientCountHint = contacts.length;
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
    const owned = new Set(await aiCampaignRepository.getFormIdsOwnedBy(ownerId, formIds));
    if (formIds.some((id) => !owned.has(id))) {
      throw bad('FORM_NOT_FOUND', 'Có biểu mẫu không tồn tại hoặc không thuộc tài khoản của bạn.');
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
  } else if (type === 'zalo_groups') {
    // groupIds rỗng = gửi MỌI nhóm của tài khoản (bộ biên dịch không chặn) → bắt buộc ≥ 1 nhóm.
    const groupIds = toStringList(rawAudience.groupIds);
    if (groupIds.length === 0) throw bad('ZALO_GROUPS_REQUIRED', 'Vui lòng chọn ít nhất một nhóm Zalo để gửi.');
    if (groupIds.length > MAX_ZALO_GROUPS) throw bad('ZALO_GROUPS_TOO_MANY', `Chỉ chọn tối đa ${MAX_ZALO_GROUPS} nhóm Zalo.`);
    audience.groupIds = groupIds;
    recipientCountHint = groupIds.length;
  }

  const rawContent = source.content && typeof source.content === 'object' ? source.content : {};
  const mode = toTrimmedString(rawContent.mode);
  let content;
  if (mode === 'template') {
    const templateId = toPositiveInt(rawContent.templateId);
    if (!templateId) throw bad('TEMPLATE_REQUIRED', 'Vui lòng chọn một mẫu tin.');
    content = { mode: 'template', templateId };
  } else if (mode === 'custom') {
    const text = toTrimmedString(rawContent.body);
    if (!text) throw bad('CONTENT_REQUIRED', 'Vui lòng nhập nội dung tin nhắn.');
    if (text.length > MAX_CUSTOM_BODY_LENGTH[channel]) {
      throw bad('CONTENT_TOO_LONG', `Nội dung tối đa ${MAX_CUSTOM_BODY_LENGTH[channel].toLocaleString('vi-VN')} ký tự.`);
    }
    let subject = '';
    if (channel === 'email') {
      subject = toTrimmedString(rawContent.subject).replace(/\s+/g, ' ');
      if (!subject) throw bad('SUBJECT_REQUIRED', 'Vui lòng nhập tiêu đề email.');
      if (subject.length > MAX_EMAIL_SUBJECT_LENGTH) {
        throw bad('SUBJECT_TOO_LONG', `Tiêu đề email tối đa ${MAX_EMAIL_SUBJECT_LENGTH} ký tự.`);
      }
    }
    content = { mode: 'custom', subject, body: text };
  } else {
    throw bad('INVALID_CONTENT', 'Vui lòng chọn dùng mẫu có sẵn hoặc tự soạn nội dung.');
  }

  return { campaignName, channel, senderId, audience, content, directRecipients, recipientCountHint };
}

/**
 * Dựng `CampaignIntentV1` từ body đã chuẩn hoá — bảng ánh xạ ở plan §PR-1. Hàm thuần.
 * "Khách hàng đã lưu" KHÔNG dùng audience `db` (node `interested_customers` đọc `customer_purchases`, gần như luôn ra 0 người):
 * server lấy danh sách rồi đổ vào danh sách nhập sẵn, nên intent là `manual`.
 *
 * @param {Awaited<ReturnType<typeof normalizeSimpleBody>>} input
 * @returns {object} CampaignIntentV1
 */
export function buildSimpleIntent(input) {
  const { channel, senderId, audience } = input;
  const recipientKind = channel === 'email' ? 'email' : 'phone';

  let intentAudience;
  switch (audience.type) {
    case 'customers':
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
    default:
      throw bad('INVALID_AUDIENCE', 'Nguồn người nhận không hợp lệ.');
  }

  return {
    version: 1,
    channel,
    sender: { type: channel === 'email' ? 'email_account' : 'zalo_account', id: senderId },
    audience: intentAudience,
    schedule: { type: 'once' },
  };
}

/** Khối gửi + tên trường bước theo kênh. */
const SEND_NODE_BY_CHANNEL = Object.freeze({
  email: { subtype: 'send_email', stepsField: 'emailSteps' },
  zalo: { subtype: 'send_zalo_personal', stepsField: 'zaloPersonalTemplateSteps' },
  zalo_group: { subtype: 'send_zalo_group', stepsField: 'zaloGroupTemplateSteps' },
});

/** Gán mẫu tin có sẵn vào bước 0 của khối gửi (sửa tại chỗ trên đồ thị vừa biên dịch). */
function attachTemplate(nodes, channel, templateId) {
  const { subtype, stepsField } = SEND_NODE_BY_CHANNEL[channel];
  const sendNode = nodes.find((node) => getNodeSubtype(node) === subtype);
  const step = sendNode?.config?.[stepsField]?.[0];
  if (!step) throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
  step.templateId = templateId;
}

/**
 * Biên dịch body → đồ thị chiến dịch (chưa prepare): intent → (landing → form) → isCompilableIntent → compileCampaign →
 * gắn nội dung. Không chạm DB trừ bước tra landing → biểu mẫu.
 *
 * @returns {Promise<{ nodes: object[], connections: object[] }>}
 */
async function compileSimpleGraph(input, { ownerId }) {
  const intent = await applyLandingAudienceResolution(buildSimpleIntent(input), ownerId);

  const check = isCompilableIntent(intent);
  if (!check.ok) {
    // Với 3 kênh đã kiểm ở normalizeSimpleBody, `channel` chỉ khuyết khi gói không có kênh Zalo (đọc từ ngữ cảnh do
    // channelEntitlementContext đặt — thiếu middleware này thì chốt chặn gói im lặng mất).
    if (check.missing.includes('channel') && input.channel !== 'email') {
      throw new SimpleCampaignError(403, 'CHANNEL_NOT_IN_PLAN', buildChannelNotInPlanMessage('zalo'), { missing: check.missing });
    }
    throw bad('INTENT_INCOMPLETE', 'Thông tin chiến dịch chưa đầy đủ.', { missing: check.missing });
  }
  const compiled = compileCampaign(intent);

  let nodes = compiled.nodes;
  let connections = compiled.connections;

  if (input.content.mode === 'custom') {
    const slot = compiled.contentSlots?.[0];
    if (!slot) throw bad('INVALID_DRAFT_RESOURCES', 'Không dựng được bước gửi cho chiến dịch.');
    try {
      ({ script: { nodes, connections } } = applySlotsToGraph(compiled, [
        { slotId: slot.slotId, message: input.content.body, subject: input.content.subject },
      ]));
    } catch (error) {
      throw bad('INVALID_CONTENT', error?.message || 'Nội dung tin nhắn không hợp lệ.');
    }
  } else {
    attachTemplate(nodes, input.channel, input.content.templateId);
  }

  if (input.audience.type === 'sheet' && input.audience.sheetName) {
    const sheetNode = nodes.find((node) => getNodeSubtype(node) === 'read_sheet');
    if (sheetNode) sheetNode.config = { ...(sheetNode.config || {}), sheetName: input.audience.sheetName };
  }

  return { nodes, connections };
}

/** Tài khoản gửi sau prepareScript còn đúng tài khoản đã chọn không (nhân viên chưa được giao thì prepareScript gỡ id đi). */
function senderSurvivedPrepare(nodes, channel, senderId) {
  const key = channel === 'email' ? 'fromEmailId' : 'zaloAccountId';
  const subtypes = channel === 'email'
    ? ['send_email']
    : ['select_zalo_account', 'send_zalo_personal', 'send_zalo_group'];
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
    campaignType: input.channel,
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
  if (!senderSurvivedPrepare(prepared.nodes, input.channel, input.senderId) && !issues.some((item) => item.code === 'missing_sender')) {
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
  for (const resourceKey of ['campaigns', CAMPAIGN_TYPE_RESOURCE_KEY[channel]]) {
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
  const { input, view, issues } = await buildSimpleDraft({
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
  // Đã biết chắc số người nhận (danh sách nhập sẵn / khách đã lưu / số nhóm Zalo) thì không báo "chưa đếm được": bộ ước tính
  // không đếm thành viên nhóm Zalo nên luôn trả cảnh báo này cho Zalo nhóm dù câu tóm tắt đã nói "1 nhóm" (thử prod 17/10).
  if (unknownCount && input.recipientCountHint == null) {
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

  let recipientCount = input.recipientCountHint;
  if (recipientCount == null && estimate && !unknownCount) {
    recipientCount = (estimate.perNode || []).reduce((sum, node) => sum + (Number(node.recipients) || 0), 0);
  }

  return {
    readyToCreate: blockingIssues.length === 0,
    issues: issuesOut,
    estimate,
    recipientCount: recipientCount ?? null,
    recipientUnit: input.channel === 'zalo_group' ? 'group' : 'person',
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

  if (input.content.mode === 'custom') {
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
