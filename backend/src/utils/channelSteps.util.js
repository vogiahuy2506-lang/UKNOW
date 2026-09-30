/**
 * P7 (PLAN_TG_WA_DAY_DU) — nhiều bước có hẹn giờ cho node kênh "adapter" (Telegram/WhatsApp).
 * Hình dạng: `config.steps[i] = { message, attachments?, templateId?, delayValue?, delayUnit? }`;
 * `delayValue/delayUnit` của bước i >= 1 = "gửi sau ... kể từ khi bước i-1 xong" (bước đầu KHÔNG trễ).
 * Cùng khuôn `zaloPersonalTemplateSteps` (minutes | hours | days, mặc định phút).
 */

/** Tối đa số bước mỗi node kênh adapter (FE cũng chặn ở 5). */
export const MAX_CHANNEL_STEPS = 5;

const HOUR_MS = 60 * 60 * 1000;
const STEP_DELAY_UNIT_MS = Object.freeze({ minutes: 60 * 1000, hours: HOUR_MS, days: 24 * HOUR_MS });

/** Trần độ trễ một bước: 30 ngày (chống gõ nhầm con số vô lý). */
export const MAX_STEP_DELAY_MS = 30 * 24 * HOUR_MS;

/** Số bước của chuỗi drip do trợ lý AI dựng = số ngày × số tin mỗi ngày (khuôn compiler Zalo). */
export function countDripSteps(schedule) {
  const days = Math.max(1, Number(schedule?.days) || 1);
  const slotsPerDay = Math.max(1, Number(schedule?.slotsPerDay) || 1);
  return days * slotsPerDay;
}

/**
 * Độ trễ (ms) TRƯỚC khi gửi một bước. Thiếu/sai/âm = 0 (gửi liền). Người gọi tự bỏ qua bước ĐẦU.
 *
 * @param {{delayValue?: any, delayUnit?: string}|null|undefined} step
 * @returns {number}
 */
export function resolveStepDelayMs(step) {
  const value = Number.parseInt(step?.delayValue, 10);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * (STEP_DELAY_UNIT_MS[step?.delayUnit] || STEP_DELAY_UNIT_MS.minutes);
}

/**
 * Kiểm cấu hình bước của node kênh adapter ở preflight: <= MAX_CHANNEL_STEPS bước; độ trễ (nếu có) là số nguyên >= 0,
 * đơn vị hợp lệ, không quá 30 ngày. Trả null nếu hợp lệ, hoặc `{ code, message }`.
 *
 * @param {Array<object>|undefined} steps
 * @returns {{code: string, message: string}|null}
 */
export function validateChannelSteps(steps) {
  if (!Array.isArray(steps)) return null;
  if (steps.length > MAX_CHANNEL_STEPS) {
    return { code: 'CHANNEL_TOO_MANY_STEPS', message: `Mỗi node gửi tối đa ${MAX_CHANNEL_STEPS} bước (đang có ${steps.length}).` };
  }
  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index] || {};
    const raw = step.delayValue;
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        return { code: 'CHANNEL_INVALID_STEP_DELAY', message: `Độ trễ của bước ${index + 1} phải là số nguyên không âm.` };
      }
    }
    if (step.delayUnit !== undefined && step.delayUnit !== null && !STEP_DELAY_UNIT_MS[step.delayUnit]) {
      return { code: 'CHANNEL_INVALID_STEP_DELAY', message: `Đơn vị độ trễ của bước ${index + 1} không hợp lệ (phút, giờ hoặc ngày).` };
    }
    if (resolveStepDelayMs(step) > MAX_STEP_DELAY_MS) {
      return { code: 'CHANNEL_INVALID_STEP_DELAY', message: `Độ trễ của bước ${index + 1} quá 30 ngày.` };
    }
  }
  return null;
}

export default { MAX_CHANNEL_STEPS, MAX_STEP_DELAY_MS, resolveStepDelayMs, validateChannelSteps, countDripSteps };
