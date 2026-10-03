/**
 * Ngân sách thời gian khi AI trả lời một KHÁCH ĐANG CHỜ (chatbot Zalo/Telegram/WhatsApp/web).
 *
 * Trần thật của đường API là 100 giây (Cloudflare cắt). Bản cũ: `customChat` thử lại tới 3 × 30 giây (gần 100 giây,
 * widget quay vòng vòng); `chatRouter` dùng `Promise.race` 30 giây nhưng KHÔNG huỷ `fetch` — Google trả lời sau mốc đó
 * vẫn tính tiền mà không dòng nào ghi sổ. Mức mới: cả lượt (thử lại + model dự phòng) gói trong 25 giây, và hết hạn thì
 * `AbortController` huỷ thật lượt đang bay.
 *
 * - `totalTimeoutMs`: trần TỔNG, hết là huỷ fetch đang chạy.
 * - `timeoutMs`: trần MỘT lượt — bằng trần tổng, vì lượt nào hỏng nhanh (503 trong ~1,4 giây như sự cố 24/09) thì
 *   phần còn lại dành cho lượt thử lại / model dự phòng.
 * - `retryBudgetMs`: quá mốc này thì thôi thử lại và thôi chuyển dự phòng — chừa ≥ 10 giây cho lượt dự phòng.
 */
export const CHAT_REPLY_BUDGET = Object.freeze({
  timeoutMs: 25000,
  totalTimeoutMs: 25000,
  retryBudgetMs: 15000,
});
