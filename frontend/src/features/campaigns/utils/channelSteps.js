/**
 * P7 (PLAN_TG_WA_DAY_DU) — nhiều bước có hẹn giờ cho node send_telegram / send_whatsapp.
 * PHẢN CHIẾU backend `backend/src/utils/channelSteps.util.js` (MAX_CHANNEL_STEPS = 5, độ trễ tối đa 30 ngày);
 * spec `channelSteps.spec.js` ghim đúng các giá trị đó. Backend (preflight) vẫn kiểm lại.
 */

export const MAX_CHANNEL_STEPS = 5;

const DELAY_UNIT_MS = Object.freeze({ minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 });
export const MAX_CHANNEL_STEP_DELAY_MS = 30 * DELAY_UNIT_MS.days;

/** Bước rỗng; bước >= 2 có sẵn độ trễ (mặc định 0 phút = gửi liền sau bước trước). */
export const createEmptyChannelStep = (index = 0) => (
  index > 0 ? { message: '', delayValue: 0, delayUnit: 'minutes' } : { message: '' }
);

/**
 * Kiểm các bước trước khi lưu node. Trả '' nếu hợp lệ, hoặc câu báo lỗi (tiếng Việt, cùng khuôn các nhánh send_* khác).
 * Nội dung/đính kèm của TỪNG bước do người gọi kiểm (giới hạn ký tự khác nhau theo kênh) — đây chỉ lo số bước + độ trễ.
 *
 * @param {Array<object>} steps
 * @returns {string}
 */
export const describeChannelStepsProblem = (steps) => {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length > MAX_CHANNEL_STEPS) return `Mỗi node gửi tối đa ${MAX_CHANNEL_STEPS} bước.`;
  for (let index = 1; index < list.length; index += 1) {
    const raw = list[index]?.delayValue;
    const value = Number(raw === '' || raw == null ? 0 : raw);
    if (!Number.isInteger(value) || value < 0) return `Độ trễ của bước ${index + 1} phải là số nguyên không âm.`;
    const unitMs = DELAY_UNIT_MS[list[index]?.delayUnit || 'minutes'];
    if (!unitMs) return `Đơn vị độ trễ của bước ${index + 1} không hợp lệ.`;
    if (value * unitMs > MAX_CHANNEL_STEP_DELAY_MS) return `Độ trễ của bước ${index + 1} không được quá 30 ngày.`;
  }
  return '';
};
