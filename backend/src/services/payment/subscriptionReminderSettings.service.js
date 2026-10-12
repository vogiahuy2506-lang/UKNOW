import { findSettings, saveSettings } from '../../repositories/admin/subscriptionReminderSettings.repository.js';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 1.4/3.3 — chốt của sếp: mặc định [7,3] (đúng
// hành vi hôm nay), tối đa 5 mốc, mỗi mốc 1-365 ngày. Luật hợp lệ đặt ở ĐÂY (service), không ở
// route, để cron (đọc) và API admin (đọc + ghi) dùng chung một nguồn sự thật.
export const DEFAULT_REMINDER_DAYS_BEFORE = Object.freeze([7, 3]);
// PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md, B2 — user chốt 12/10: gói năm nhắc trước ÍT NHẤT 30 ngày. Phải khớp
// DEFAULT của cột days_before_yearly (migration 299) và ARRAY[30,7,3] ở subscriptionReminderSettings.repository.js.
export const DEFAULT_REMINDER_DAYS_BEFORE_YEARLY = Object.freeze([30, 7, 3]);
const MAX_MARKS = 5;
const MIN_DAY = 1;
const MAX_DAY = 365;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * Kiểm + chuẩn hoá danh sách mốc trước khi lưu. Rỗng là hợp lệ (tắt hết nhắc trước hạn, chỉ còn
 * thư T-0). Trả về bản sắp giảm dần — thứ tự gửi luôn từ xa tới gần.
 *
 * Dùng chung cho cả hai danh sách (gói tháng `daysBefore`, gói năm `daysBeforeYearly`) — `fieldName` chỉ để
 * thông báo lỗi nêu đúng trường.
 *
 * @param {unknown} daysBefore
 * @param {string} [fieldName]
 * @returns {number[]}
 */
export function normalizeReminderDaysBefore(daysBefore, fieldName = 'daysBefore') {
  if (!Array.isArray(daysBefore)) {
    throw badRequest(`${fieldName} phải là một danh sách số nguyên`);
  }
  if (daysBefore.length > MAX_MARKS) {
    throw badRequest(`Tối đa ${MAX_MARKS} mốc`);
  }
  for (const value of daysBefore) {
    if (!Number.isInteger(value)) {
      throw badRequest('Mỗi mốc phải là số nguyên');
    }
    if (value < MIN_DAY || value > MAX_DAY) {
      throw badRequest(`Mốc phải từ ${MIN_DAY} đến ${MAX_DAY} ngày`);
    }
  }
  if (new Set(daysBefore).size !== daysBefore.length) {
    throw badRequest('Không được trùng mốc');
  }
  return [...daysBefore].sort((a, b) => b - a);
}

function toDto(row) {
  if (!row) {
    return {
      daysBefore: [...DEFAULT_REMINDER_DAYS_BEFORE],
      daysBeforeYearly: [...DEFAULT_REMINDER_DAYS_BEFORE_YEARLY],
      updatedBy: null,
      updatedAt: null,
    };
  }
  return {
    daysBefore: Array.isArray(row.days_before) ? row.days_before : [...DEFAULT_REMINDER_DAYS_BEFORE],
    daysBeforeYearly: Array.isArray(row.days_before_yearly)
      ? row.days_before_yearly
      : [...DEFAULT_REMINDER_DAYS_BEFORE_YEARLY],
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Đọc cấu hình. Bảng chưa có dòng (chưa chạy migration, hoặc bị truncate ở test) hay DB lỗi tạm
 * thời đều KHÔNG được chặn cron/API — rơi về mặc định [7,3], cùng khuôn
 * loadCustomSystemEmailTemplate đang dùng cho mẫu thư.
 *
 * @returns {Promise<{daysBefore: number[], daysBeforeYearly: number[], updatedBy: number|null, updatedAt: string|null}>}
 */
export async function getReminderSettings() {
  try {
    return toDto(await findSettings());
  } catch (error) {
    console.warn('[SubscriptionReminderSettings] Đọc cấu hình lỗi, dùng mặc định [7,3]:', error.message);
    return toDto(null);
  }
}

/**
 * `daysBeforeYearly` KHÔNG gửi (undefined) = giữ nguyên danh sách gói năm đang lưu — client cũ chỉ biết `daysBefore`
 * không được vô tình xoá mốc gói năm. Có gửi thì phải hợp lệ; `[]` hợp lệ (tắt nhắc trước hạn cho gói năm).
 */
export async function updateReminderSettings(input, actorUserId) {
  const daysBefore = normalizeReminderDaysBefore(input?.daysBefore);
  const daysBeforeYearly = input?.daysBeforeYearly === undefined
    ? undefined
    : normalizeReminderDaysBefore(input.daysBeforeYearly, 'daysBeforeYearly');
  const row = await saveSettings({ daysBefore, daysBeforeYearly, updatedBy: actorUserId });
  return toDto(row);
}
