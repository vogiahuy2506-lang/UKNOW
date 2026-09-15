import { escapeHtml } from './htmlEscape.util.js';

const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/+$/, '');

/**
 * Khối chân thư song ngữ ngắn "Rút lại đồng ý", dùng CHUNG cho mọi thư gửi người nộp Biểu mẫu
 * (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7b mục 3): thư xác nhận lịch hẹn, thư hướng
 * dẫn chuyển khoản, thư đã xác nhận thanh toán (`form.service.js`), thư nhắc lịch
 * (`formBookingReminder.service.js`).
 *
 * Chỉ chèn khi bài nộp CÓ `marketingConsent === true` và CHƯA rút — bài không tích đồng ý (false/
 * null) hoặc đã rút trước đó thì trả `''`, không chèn gì (gọi hàm này vô điều kiện ở mọi nơi gửi
 * thư là an toàn, không cần caller tự kiểm trước).
 *
 * Dùng `unsubscribe_token` (migration 223) — KHÔNG dùng `access_token` (khoá xem trạng thái công
 * khai, mục đích khác, không nên trùng công dụng).
 *
 * @param {{ marketingConsent: boolean|null|undefined, consentWithdrawnAt: string|Date|null|undefined, unsubscribeToken: string|null|undefined }} params
 * @returns {string}
 */
export function buildFormUnsubscribeFooterHtml({ marketingConsent, consentWithdrawnAt, unsubscribeToken }) {
  if (marketingConsent !== true) return '';
  if (consentWithdrawnAt) return '';
  if (!unsubscribeToken) return '';

  const url = `${FRONTEND_URL}/api/public/forms/unsubscribe/${encodeURIComponent(unsubscribeToken)}`;
  const safeUrl = escapeHtml(url);
  return `
    <p style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.6">
      Không muốn nhận thông tin tiếp thị nữa? <a href="${safeUrl}">Rút lại đồng ý</a><br>
      Don't want to receive marketing updates anymore? <a href="${safeUrl}">Withdraw consent</a>
    </p>
  `;
}
