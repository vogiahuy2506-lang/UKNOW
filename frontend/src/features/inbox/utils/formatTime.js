/**
 * formatTime.js — helper format thời gian compact cho Hộp thư.
 *
 * Trước đây `formatTime` được copy inline trong cả `ConversationList.jsx`
 * và `TiktokConversationList.jsx` → DRY violation. Khi một chỗ đổi logic
 * (vd: thêm "tuần trước"), chỗ kia sẽ lệch.
 *
 * Tách ra đây để:
 * - Cả hai component import cùng nguồn
 * - Test helper riêng nếu cần
 * - Dễ thêm logic mới (vd: locale-aware, timezone)
 *
 * H-22: có dấu cách giữa số và đơn vị ("6 giờ", "45 phút", "3 ngày");
 * tiếng Anh giữ "6h".
 *
 * @param {string} dateString - ISO date string hoặc bất kỳ Date-compatible string
 * @param {function} t - hàm i18n `t(key, params?, fallback?)`
 * @param {string} locale - 'vi' hoặc 'en'
 * @returns {string} - chuỗi thời gian compact
 */
export function formatTime(dateString, t, locale) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('inbox.justNow');
  if (diffMins < 60) return t('inbox.timeMinutes', { n: diffMins });
  if (diffHours < 24) return t('inbox.timeHours', { n: diffHours });
  if (diffDays < 7) return t('inbox.timeDays', { n: diffDays });
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', { day: 'numeric', month: 'short' });
}

export default formatTime;
