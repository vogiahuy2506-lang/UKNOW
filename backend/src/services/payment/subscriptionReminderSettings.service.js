import { findSettings, saveSettings } from '../../repositories/admin/subscriptionReminderSettings.repository.js';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 1.4/3.3 — chốt của sếp: mặc định [7,3] (đúng
// hành vi hôm nay), tối đa 5 mốc, mỗi mốc 1-365 ngày. Luật hợp lệ đặt ở ĐÂY (service), không ở
// route, để cron (đọc) và API admin (đọc + ghi) dùng chung một nguồn sự thật.
export const DEFAULT_REMINDER_DAYS_BEFORE = Object.freeze([7, 3]);
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
 * @param {unknown} daysBefore
 * @returns {number[]}
 */
export function normalizeReminderDaysBefore(daysBefore) {
  if (!Array.isArray(daysBefore)) {
    throw badRequest('daysBefore phải là một danh sách số nguyên');
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
    return { daysBefore: [...DEFAULT_REMINDER_DAYS_BEFORE], updatedBy: null, updatedAt: null };
  }
  return {
    daysBefore: Array.isArray(row.days_before) ? row.days_before : [...DEFAULT_REMINDER_DAYS_BEFORE],
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Đọc cấu hình. Bảng chưa có dòng (chưa chạy migration, hoặc bị truncate ở test) hay DB lỗi tạm
 * thời đều KHÔNG được chặn cron/API — rơi về mặc định [7,3], cùng khuôn
 * loadCustomSystemEmailTemplate đang dùng cho mẫu thư.
 *
 * @returns {Promise<{daysBefore: number[], updatedBy: number|null, updatedAt: string|null}>}
 */
export async function getReminderSettings() {
  try {
    return toDto(await findSettings());
  } catch (error) {
    console.warn('[SubscriptionReminderSettings] Đọc cấu hình lỗi, dùng mặc định [7,3]:', error.message);
    return toDto(null);
  }
}

export async function updateReminderSettings(input, actorUserId) {
  const daysBefore = normalizeReminderDaysBefore(input?.daysBefore);
  const row = await saveSettings({ daysBefore, updatedBy: actorUserId });
  return toDto(row);
}
