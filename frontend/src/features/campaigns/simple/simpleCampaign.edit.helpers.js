/**
 * Hàm thuần của trình "Từng bước" ở CHẾ ĐỘ SỬA (PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-B).
 * Biến phản hồi `GET /campaigns/:id/simple` thành trạng thái của trình, dựng body `PUT`, so sánh để biết có thay đổi
 * chưa lưu, và quyết định lịch chạy cần tạo / sửa / xoá. Không React, không gọi mạng.
 */

import {
  EMPTY_AUDIENCE,
  EMPTY_MESSAGE_CONTENT,
  nextFollowUpId,
  buildScheduleCron,
  buildSimpleCampaignBody,
  createInitialWizardState,
  scheduleTypeForApi,
} from './simpleCampaign.helpers';
import { isCronExpressionOneTimeRun, resolveOneTimeSchedulePlannedAt } from '../utils/campaignRunSchedule.helpers';

/** Ở chế độ sửa, "Chạy tay" là `{ type: 'now' }` (không có lịch); "gửi ngay" / "tự động" là nút hành động riêng. */
export const EDIT_WHEN_OPTION_IDS = Object.freeze(['now', 'scheduled', 'recurring']);

/** Mã lý do mà server trả khi chiến dịch có từ 2 lịch trở lên — chỉ khoá bước "Khi nào gửi", phần khác vẫn sửa được. */
export const MULTIPLE_SCHEDULES_CODE = 'multiple_schedules';

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Lịch trên server → lựa chọn ở bước "Khi nào gửi?". Chỉ đọc ngược được các dạng trình tạo ghi ra
 * (một lần / hằng ngày / hằng tuần / hằng tháng ngày 1); dạng khác (cron tuỳ chỉnh, sau N ngày…) → khoá, chỉ xem.
 *
 * @param {Array<object>} schedules `schedules` của GET
 * @returns {{ schedule: object, original: object|null, locked: boolean, lockedCron: string }}
 */
export const parseServerSchedules = (schedules) => {
  const list = Array.isArray(schedules) ? schedules : [];
  if (list.length === 0) return { schedule: { type: 'now' }, original: null, locked: false, lockedCron: '' };
  const first = list[0];
  const original = {
    id: first.id,
    scheduleType: String(first.scheduleType || ''),
    cronExpression: String(first.cronExpression || ''),
    enabled: first.enabled !== false,
  };
  const locked = (lockedCron = original.cronExpression) => ({ schedule: { type: 'now' }, original, locked: true, lockedCron });
  if (list.length > 1) return locked(list.map((item) => item.cronExpression).filter(Boolean).join(' | '));

  const parts = original.cronExpression.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return locked();
  const time = `${pad2(parts[1])}:${pad2(parts[0])}`;

  if (original.scheduleType === 'once') {
    if (!isCronExpressionOneTimeRun(original.cronExpression)) return locked();
    const planned = resolveOneTimeSchedulePlannedAt({ cronExpression: original.cronExpression });
    if (!planned) return locked();
    const date = `${planned.getFullYear()}-${pad2(planned.getMonth() + 1)}-${pad2(planned.getDate())}`;
    return { schedule: { type: 'scheduled', date, time }, original, locked: false, lockedCron: '' };
  }
  if (original.scheduleType === 'daily' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    return { schedule: { type: 'recurring', frequency: 'daily', weeklyDay: '1', time }, original, locked: false, lockedCron: '' };
  }
  if (original.scheduleType === 'weekly' && parts[2] === '*' && parts[3] === '*' && /^[0-7]$/.test(parts[4])) {
    return {
      schedule: { type: 'recurring', frequency: 'weekly', weeklyDay: parts[4] === '7' ? '0' : parts[4], time },
      original,
      locked: false,
      lockedCron: '',
    };
  }
  if (original.scheduleType === 'monthly' && parts[2] === '1' && parts[3] === '*' && parts[4] === '*') {
    return { schedule: { type: 'recurring', frequency: 'monthly', weeklyDay: '1', time }, original, locked: false, lockedCron: '' };
  }
  return locked();
};

/**
 * Chuỗi nhận dạng một lựa chọn lịch (để biết người dùng có đổi lịch không). Chỉ gồm trường người dùng chỉnh được.
 *
 * @param {object} schedule
 * @returns {string}
 */
export const scheduleSignature = (schedule) => {
  switch (schedule?.type) {
    case 'scheduled':
      return `scheduled|${schedule.date}|${schedule.time}`;
    case 'recurring':
      return `recurring|${schedule.frequency}|${schedule.frequency === 'weekly' ? schedule.weeklyDay : ''}|${schedule.time}`;
    default:
      return 'now';
  }
};

/** `form.followUps` của GET → thẻ tin sau của trình (tên mẫu được điền sau khi danh sách mẫu tải xong, như tin 1). */
const buildFollowUpsFromServer = (list) => (Array.isArray(list) ? list : []).map((item) => {
  const c = item?.content && typeof item.content === 'object' ? item.content : {};
  const content = { ...EMPTY_MESSAGE_CONTENT };
  if (c.mode === 'template') {
    content.mode = 'template';
    content.templateId = Number(c.templateId) || null;
  } else if (c.mode === 'custom') {
    content.mode = 'custom';
    content.subject = String(c.subject || '');
    content.body = String(c.body || '');
  }
  return {
    id: nextFollowUpId(),
    delayValue: Number(item?.delayValue) || 1,
    delayUnit: ['hours', 'minutes'].includes(item?.delayUnit) ? item.delayUnit : 'days',
    content,
  };
});

/**
 * Trạng thái trình từ phản hồi GET. Thiếu `form` (không đọc ngược được) → null (nơi gọi chỉ hiện chế độ xem).
 *
 * @param {object} data đã `unwrapResponseData`
 * @returns {object|null}
 */
export const buildStateFromServer = (data) => {
  const form = data?.form;
  if (!form || typeof form !== 'object') return null;
  const channel = String(data.channel || form.channel || '');
  const audienceIn = form.audience && typeof form.audience === 'object' ? form.audience : {};
  const contentIn = form.content && typeof form.content === 'object' ? form.content : {};
  const base = createInitialWizardState();

  const audience = { ...EMPTY_AUDIENCE, type: audienceIn.type || null };
  if (Array.isArray(audienceIn.slugs)) audience.slugs = audienceIn.slugs.map(String);
  if (Array.isArray(audienceIn.formIds)) audience.formIds = audienceIn.formIds.map(Number);
  if (audienceIn.sheetUrl) {
    audience.sheetUrl = String(audienceIn.sheetUrl);
    audience.sheetCheckedUrl = audience.sheetUrl.trim();
  }
  if (audienceIn.sheetName) audience.sheetName = String(audienceIn.sheetName);
  const manual = audienceIn.emails || audienceIn.phones;
  if (Array.isArray(manual)) audience.manualText = manual.join('\n');
  if (Array.isArray(audienceIn.uids)) audience.uids = audienceIn.uids.map(String);
  if (Array.isArray(audienceIn.groupIds)) audience.groupIds = audienceIn.groupIds.map(String);

  const content = { mode: null, templateId: null, templateName: '', subject: '', body: '' };
  if (contentIn.mode === 'template') {
    content.mode = 'template';
    content.templateId = Number(contentIn.templateId) || null;
  } else if (contentIn.mode === 'custom') {
    content.mode = 'custom';
    content.subject = String(contentIn.subject || '');
    content.body = String(contentIn.body || '');
  }

  const parsed = parseServerSchedules(data.schedules);
  const hasSender = form.senderId !== undefined && form.senderId !== null && form.senderId !== '';
  return {
    ...base,
    channel,
    sender: hasSender ? { id: Number(form.senderId), label: '' } : null,
    audience,
    content,
    followUps: buildFollowUpsFromServer(form.followUps),
    schedule: parsed.schedule,
    campaignName: String(data.campaignName || '').trim(),
  };
};

/** Body `PUT /campaigns/:id/simple` = body tạo (đã mang `followUps` khi có chuỗi tin). */
export const buildEditBody = (state) => buildSimpleCampaignBody(state);

/** Dấu vân tay từ body đã dựng + chữ ký lịch. */
export const makeFingerprint = (body, signature) => JSON.stringify({ body, schedule: signature });

/** Dấu vân tay của cái SẼ ĐƯỢC LƯU: body PUT + lịch. Khác baseline = còn thay đổi chưa lưu. */
export const fingerprintEditState = (state) => {
  let body;
  try {
    body = buildEditBody(state);
  } catch {
    body = null;
  }
  return makeFingerprint(body, scheduleSignature(state.schedule));
};

/**
 * Lịch cần làm gì khi lưu: không đổi → none; chưa có + chọn hẹn/lặp → create; có + chọn chạy tay → delete; có + đổi → update.
 *
 * @param {{ original: object|null, schedule: object, locked: boolean }} args
 * @returns {'none'|'create'|'update'|'delete'}
 */
export const planScheduleSync = ({ original, schedule, locked }) => {
  if (locked) return 'none';
  const wantsSchedule = schedule?.type === 'scheduled' || schedule?.type === 'recurring';
  if (!original) return wantsSchedule ? 'create' : 'none';
  if (!wantsSchedule) return 'delete';
  const originalState = parseServerSchedules([original]).schedule;
  return scheduleSignature(originalState) === scheduleSignature(schedule) ? 'none' : 'update';
};

/** Body `PATCH /campaign-schedules/:id` — chỉ đổi kiểu + cron (tên, bật/tắt giữ nguyên). */
export const buildScheduleUpdatePayload = (schedule) => ({
  scheduleType: scheduleTypeForApi(schedule),
  cronExpression: buildScheduleCron(schedule),
});
