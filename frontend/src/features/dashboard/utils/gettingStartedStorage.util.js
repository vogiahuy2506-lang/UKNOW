/**
 * Cờ `localStorage` của thẻ "3 bước bắt đầu" ở trang chủ (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27).
 *
 * - `done`: đã đủ 3/3 — lần sau KHÔNG gọi API nữa.
 * - `dismissed`: khách bấm "Ẩn" — cũng không gọi API nữa.
 * Khoá theo user để máy dùng chung nhiều tài khoản không ẩn nhầm của nhau.
 *
 * Mọi đọc/ghi bọc try/catch: chế độ riêng tư / chặn dữ liệu trang có thể làm `localStorage` ném lỗi hoặc rỗng.
 * Đọc lỗi = coi như chưa có cờ (thẻ gọi API như lần đầu); ghi lỗi = bỏ qua (lần sau hỏi lại, không hỏng gì).
 */

export const gettingStartedDoneKey = (userId) => `fa_getting_started_done:${userId}`;
export const gettingStartedDismissedKey = (userId) => `fa_getting_started_dismissed:${userId}`;

/**
 * @param {string} key
 * @returns {boolean}
 */
export function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @returns {void}
 */
export function writeFlag(key) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Không ghi được cờ thì lần sau thẻ hỏi lại server — không ảnh hưởng gì khác.
  }
}
