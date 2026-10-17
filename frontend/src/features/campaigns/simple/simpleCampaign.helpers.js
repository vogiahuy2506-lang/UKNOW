/**
 * Hàm thuần của trình tạo chiến dịch "Từng bước" (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14, PR-2).
 * Không React, không gọi mạng: trạng thái của trình → body gửi server (hợp đồng PR-1), điều kiện sang bước kế,
 * dọn lựa chọn khi đổi kênh. Tách riêng để test được từng quy tắc mà không phải dựng cả màn hình.
 */

import {
  assertOnceScheduleNotInPast,
  buildCronExpression,
  resolveScheduleNextRunAt,
} from '../utils/campaignRunSchedule.helpers';
import { resolveScheduleEstimateStartAt } from '../utils/campaignEstimate.helpers';

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

/**
 * Cách gửi ở bước "Khi nào gửi?": gửi ngay · hẹn một thời điểm · tự gửi cho người mới (chế độ liên tục) · lặp lại định kỳ.
 * `continuous` chỉ hiện với một số nguồn/kênh — xem `getAvailableWhenOptions`.
 */
export const WHEN_OPTION_IDS = Object.freeze(['now', 'scheduled', 'continuous', 'recurring']);

/** Tần suất của "Lặp lại định kỳ". Hằng tháng chỉ có ngày 1 vì cron phía giao diện cố định `m h 1 * *`. */
export const RECURRING_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly']);

/** Giá trị thứ trong tuần theo cron (0 = Chủ nhật), xếp từ Thứ hai; khoá i18n `campaigns.<tên>` đi kèm. */
export const WEEKDAY_OPTIONS = Object.freeze([
  Object.freeze({ value: '1', key: 'monday' }),
  Object.freeze({ value: '2', key: 'tuesday' }),
  Object.freeze({ value: '3', key: 'wednesday' }),
  Object.freeze({ value: '4', key: 'thursday' }),
  Object.freeze({ value: '5', key: 'friday' }),
  Object.freeze({ value: '6', key: 'saturday' }),
  Object.freeze({ value: '0', key: 'sunday' }),
]);

/**
 * "Tự động gửi cho người mới" chỉ có nghĩa với nguồn CÓ NGƯỜI MỚI ĐẾN theo thời gian (landing / biểu mẫu / Google Sheet);
 * danh sách tự nhập, khách đã lưu, bạn bè Zalo là danh sách cố định lúc tạo.
 */
export const CONTINUOUS_AUDIENCE_TYPES = Object.freeze(['landing', 'form', 'sheet']);

/** Số biểu mẫu tối đa chọn một lúc — khớp trần của node "Dữ liệu Biểu mẫu" (readFormSubmissionsFormIds.js). */
export const MAX_FORM_IDS = 50;

export const EMPTY_AUDIENCE = Object.freeze({
  type: null,
  customerTotal: null,
  slugs: [],
  landingTitles: [],
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
  /** Chuỗi tin: tin 2..N, mỗi phần tử `{ id, delayValue, delayUnit: 'days'|'hours', content }` (xem `createFollowUp`). Rỗng = gửi một tin. */
  followUps: [],
  /** Xem `createDefaultSchedule`: `{ type: 'now' | 'scheduled' | 'continuous' | 'recurring', … }`. */
  schedule: { type: 'now' },
  campaignName: '',
});

/** Tối đa 10 tin cả chuỗi = tin 1 + 9 tin sau (hợp đồng PLAN_HAI_TAB §3.1). */
export const MAX_FOLLOW_UPS = 9;
export const FOLLOW_UP_DELAY_UNITS = Object.freeze(['days', 'hours']);

export const EMPTY_MESSAGE_CONTENT = Object.freeze({ mode: null, templateId: null, templateName: '', subject: '', body: '' });

let followUpSeq = 0;
/** Id cục bộ (chỉ làm `key` React); KHÔNG gửi lên server. */
export const nextFollowUpId = () => {
  followUpSeq += 1;
  return `fu-${followUpSeq}`;
};

/** Tin sau mới: mặc định "sau 1 ngày", chưa chọn nội dung. */
export const createFollowUp = () => ({
  id: nextFollowUpId(),
  delayValue: 1,
  delayUnit: 'days',
  content: { ...EMPTY_MESSAGE_CONTENT },
});

/** Độ trễ hợp lệ = số nguyên > 0 (ô trống / chữ / số lẻ → sai). */
export const isValidFollowUpDelay = (value) => {
  if (value === '' || value === null || value === undefined) return false;
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
};

/** Một tin (tin 1 hoặc tin sau) đã đủ nội dung chưa: mẫu có id; tự soạn có nội dung, email có thêm tiêu đề. */
export const isMessageContentComplete = (channel, content) => {
  if (content?.mode === 'template') return Number(content.templateId) > 0;
  if (content?.mode === 'custom') {
    if (!String(content.body || '').trim()) return false;
    return channel !== 'email' || Boolean(String(content.subject || '').trim());
  }
  return false;
};

export const isFollowUpComplete = (channel, followUp) => (
  isValidFollowUpDelay(followUp?.delayValue)
  && FOLLOW_UP_DELAY_UNITS.includes(followUp?.delayUnit)
  && isMessageContentComplete(channel, followUp?.content)
);

/** Nội dung một tin → đúng hình dạng hợp đồng `{mode:'template',templateId} | {mode:'custom',subject?,body}`. */
export const buildMessageContentBody = (channel, content) => {
  if (content.mode === 'template') return { mode: 'template', templateId: Number(content.templateId) };
  const out = { mode: 'custom', body: String(content.body || '').trim() };
  if (channel === 'email') out.subject = String(content.subject || '').trim();
  return out;
};

export const buildFollowUpsBody = (channel, followUps) => followUps.map((item) => ({
  delayValue: Number(item.delayValue),
  delayUnit: item.delayUnit,
  content: buildMessageContentBody(channel, item.content),
}));

/** Tổng độ trễ cả chuỗi, quy ra giờ (bỏ tin có độ trễ chưa hợp lệ). */
export const totalFollowUpHours = (followUps) => followUps.reduce((sum, item) => {
  if (!isValidFollowUpDelay(item.delayValue)) return sum;
  return sum + Number(item.delayValue) * (item.delayUnit === 'hours' ? 1 : 24);
}, 0);

/** Email dùng tài khoản email; Zalo cá nhân và Zalo nhóm dùng chung danh sách tài khoản Zalo. */
export const senderKindOf = (channel) => (channel === 'email' ? 'email' : 'zalo');

/** Mẫu tin của email nằm ở `email_templates`, của Zalo (cá nhân + nhóm) ở `zalo_templates`. */
export const templateKindOf = (channel) => (channel === 'email' ? 'email' : 'zalo');

/**
 * Cách gửi nào đang dùng được với kênh + nguồn người nhận hiện tại. `continuous` chỉ khi nguồn là landing / biểu mẫu / Google Sheet
 * và kênh KHÁC Zalo nhóm (chế độ liên tục bị tắt cho Zalo nhóm ở giao diện cũ, `useCampaignRunController`).
 *
 * @param {object} state
 * @returns {string[]}
 */
export const getAvailableWhenOptions = (state) => {
  const continuousOk = state.channel !== 'zalo_group' && CONTINUOUS_AUDIENCE_TYPES.includes(state.audience?.type);
  return WHEN_OPTION_IDS.filter((id) => id !== 'continuous' || continuousOk);
};

/**
 * Giá trị khởi tạo khi người dùng bấm một thẻ ở bước "Khi nào gửi?".
 *
 * @param {string} type một trong WHEN_OPTION_IDS
 * @param {{ pollIntervalMinutes?: number }} [options] `continuous`: chu kỳ quét người mới (phút), mặc định do nơi gọi chọn
 */
export const createDefaultSchedule = (type, { pollIntervalMinutes = null } = {}) => {
  switch (type) {
    case 'scheduled':
      return { type, date: '', time: '' };
    case 'continuous':
      return { type, pollIntervalMinutes };
    case 'recurring':
      return { type, frequency: 'daily', weeklyDay: '1', time: '09:00' };
    default:
      return { type: 'now' };
  }
};

/** Đổi kênh/nguồn xong mà cách gửi đã chọn không còn dùng được (vd "Tự động gửi" sang Zalo nhóm) → về "Gửi ngay". */
export const reconcileSchedule = (state) => {
  const type = state.schedule?.type || 'now';
  if (getAvailableWhenOptions(state).includes(type)) return state;
  return { ...state, schedule: { type: 'now' } };
};

/** Ngày hôm nay theo giờ Việt Nam (UTC+7) dạng YYYY-MM-DD — cận dưới của ô chọn ngày. */
export const todayInVietnam = (now = new Date()) => new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

/**
 * Biểu mẫu lịch (đúng hình dạng `buildCronExpression` nhận) của cách gửi "hẹn giờ" / "lặp lại"; cách khác → null.
 * Luôn là lịch theo GIỜ VIỆT NAM (`once` / `daily` / `weekly` / `monthly`), KHÔNG dùng nhánh `after_delay` (nó lấy giờ máy).
 *
 * @param {object} schedule
 * @returns {object|null}
 */
export const buildScheduleForm = (schedule) => {
  if (schedule?.type === 'scheduled') {
    return { scheduleType: 'once', scheduleDate: schedule.date, scheduleTime: schedule.time };
  }
  if (schedule?.type === 'recurring') {
    return { scheduleType: schedule.frequency, scheduleTime: schedule.time, weeklyDay: schedule.weeklyDay };
  }
  return null;
};

/** Chuỗi cron của lịch (rỗng nếu không phải hẹn giờ / lặp lại hoặc thiếu dữ liệu). */
export const buildScheduleCron = (schedule) => {
  const form = buildScheduleForm(schedule);
  return form ? buildCronExpression(form) : '';
};

/** `scheduleType` gửi cho `POST /campaign-schedules`: hẹn giờ = `once`, lặp lại = daily | weekly | monthly. */
export const scheduleTypeForApi = (schedule) => (schedule?.type === 'scheduled' ? 'once' : schedule?.frequency);

/** Hẹn giờ / lặp lại = đặt LỊCH (nút "Đặt lịch", màn "Đã hẹn gửi"); gửi ngay / tự động = chạy ngay (nút "Bắt đầu gửi"). */
export const isScheduleBased = (schedule) => schedule?.type === 'scheduled' || schedule?.type === 'recurring';

/**
 * Lựa chọn ở bước "Khi nào gửi?" đã đủ và hợp lệ chưa.
 * - `scheduled`: đủ ngày + giờ và ≥ 2 phút sau hiện tại (giờ VN) — cùng luật với màn đặt lịch cũ.
 * - `recurring`: đủ giờ; hằng tuần phải có thứ.
 * - `continuous`: chu kỳ quét là số phút dương.
 *
 * @param {object} schedule
 * @param {Date} [now]
 * @returns {{ ok: true } | { ok: false, reason: 'incomplete' | 'too_soon' | 'invalid' }}
 */
export const validateSchedule = (schedule, now = new Date()) => {
  switch (schedule?.type) {
    case 'now':
      return { ok: true };
    case 'scheduled': {
      if (!String(schedule.date || '').trim() || !String(schedule.time || '').trim()) return { ok: false, reason: 'incomplete' };
      const guard = assertOnceScheduleNotInPast(buildScheduleForm(schedule), now);
      return guard.ok ? { ok: true } : { ok: false, reason: guard.reason };
    }
    case 'recurring':
      if (!RECURRING_FREQUENCIES.includes(schedule.frequency)) return { ok: false, reason: 'incomplete' };
      if (!TIME_PATTERN.test(String(schedule.time || '').trim())) return { ok: false, reason: 'incomplete' };
      if (schedule.frequency === 'weekly' && !WEEKDAY_OPTIONS.some((day) => day.value === String(schedule.weeklyDay))) {
        return { ok: false, reason: 'incomplete' };
      }
      return { ok: true };
    case 'continuous':
      return Number.isFinite(Number(schedule.pollIntervalMinutes)) && Number(schedule.pollIntervalMinutes) > 0
        ? { ok: true }
        : { ok: false, reason: 'incomplete' };
    default:
      return { ok: false, reason: 'incomplete' };
  }
};

/**
 * Mốc bắt đầu (ISO) để ước tính: hẹn giờ = giờ hẹn, lặp lại = lần nổ kế tiếp; cách khác → null (ước tính từ bây giờ).
 *
 * @param {object} schedule
 * @param {Date} [now]
 * @returns {string|null}
 */
export const resolveScheduleStartAt = (schedule, now = new Date()) => {
  const form = buildScheduleForm(schedule);
  if (!form) return null;
  return resolveScheduleEstimateStartAt(form, {
    buildCron: buildCronExpression,
    resolveNextRunAt: (item) => resolveScheduleNextRunAt(item, now),
    buildDelayedRunDate: () => null,
  });
};

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
  // Chuỗi tin: mẫu của kho kia không dùng được → xoá templateId của MỌI tin sau; chữ tự soạn được giữ.
  if (templateKindOf(state.channel) !== templateKindOf(channel) && Array.isArray(state.followUps) && state.followUps.length > 0) {
    next.followUps = state.followUps.map((item) => (
      item.content?.mode === 'template'
        ? { ...item, content: { ...item.content, templateId: null, templateName: '' } }
        : item
    ));
  }
  return reconcileSchedule(next);
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
 * @param {Date} [now] giờ hiện tại (kiểm hạn "hẹn giờ ≥ 2 phút sau")
 * @returns {boolean}
 */
export const isStepComplete = (stepId, state, now = new Date()) => {
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
      return isMessageContentComplete(channel, content)
        && (state.followUps || []).every((item) => isFollowUpComplete(channel, item));
    case 'when':
      return getAvailableWhenOptions(state).includes(schedule?.type) && validateSchedule(schedule, now).ok;
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

  const contentBody = buildMessageContentBody(channel, content);

  const body = {
    channel,
    senderId: Number(sender?.id),
    audience: audienceBody,
    content: contentBody,
  };
  // Không có tin sau → KHÔNG gửi trường `followUps` (server hiểu là gửi một lần như cũ).
  if (Array.isArray(state.followUps) && state.followUps.length > 0) {
    body.followUps = buildFollowUpsBody(channel, state.followUps);
  }
  const name = String(campaignName || '').trim();
  if (name) body.campaignName = name;
  return body;
};

/**
 * Body preview: như body tạo, thêm TUỲ CHỌN `startAt` (ISO — giờ hẹn / lần lặp kế tiếp) và `continuous: true` để server ước tính
 * theo đúng cách gửi. Body tạo KHÔNG mang hai trường này.
 *
 * @param {object} state
 * @param {Date} [now]
 */
export const buildSimplePreviewBody = (state, now = new Date()) => {
  const body = buildSimpleCampaignBody(state);
  const startAt = resolveScheduleStartAt(state.schedule, now);
  if (startAt) body.startAt = startAt;
  if (state.schedule?.type === 'continuous') body.continuous = true;
  return body;
};

/**
 * Body `POST /campaigns/:id/run`. "Tự động gửi cho người mới" thêm `continuousMode` + chu kỳ quét (cùng ba khoá với
 * `useCampaignRunController.handleRunNow`: server nhận phút hoặc mili-giây).
 *
 * @param {object} schedule
 * @param {string} runName
 */
export const buildRunBody = (schedule, runName) => {
  const body = { source: 'campaign_run', autoActivate: true, runName };
  if (schedule?.type === 'continuous') {
    const minutes = Number(schedule.pollIntervalMinutes);
    body.continuousMode = true;
    body.pollIntervalMs = minutes * 60 * 1000;
    body.pollIntervalMinutes = minutes;
    body.continuousCycleMinutes = minutes;
  }
  return body;
};

/**
 * Body `POST /campaign-schedules` cho "Hẹn giờ" / "Lặp lại": bật ngay và tự kích hoạt chiến dịch nháp vừa tạo.
 *
 * @param {object} schedule
 * @param {{ campaignId: number|string, scheduleName: string }} meta
 */
export const buildSchedulePayload = (schedule, { campaignId, scheduleName }) => ({
  campaignId,
  scheduleName,
  scheduleType: scheduleTypeForApi(schedule),
  cronExpression: buildScheduleCron(schedule),
  enabled: true,
  activateCampaign: true,
});

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
    usable: item.isLocked !== true,
    problem: item.isLocked === true ? 'locked' : null,
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
