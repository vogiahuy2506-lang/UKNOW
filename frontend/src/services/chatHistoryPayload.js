/**
 * Thu gọn lịch sử chat trước khi gửi lên `/ai/chat` (B-19, rà soát AI 03/10).
 *
 * Mỗi tin chat trước đây gửi NGUYÊN mảng `messages`, kể cả `data.html` / `data.previousHtml` / `data.css` của các thẻ landing (hàng trăm
 * KB mỗi trang) — phiên có vài trang lớn thì mỗi tin tải lên vài trăm KB tới vài MB, chạm trần 5 MB của backend là chat của phiên đó
 * hỏng (413). Backend chỉ dùng `content`, `role`, `type` và các trường nhỏ của `data` (thẻ wizard…) để dựng lại ngữ cảnh — KHÔNG đọc
 * mã nguồn trang từ lịch sử (trang nằm ở DB, sửa trang đi qua `/ai/edit-landing-html` với `sessionId`/`messageId`).
 */

const HEAVY_LANDING_KEYS = ['html', 'previousHtml', 'css'];

/**
 * @param {Array<object>} history  mảng tin { role, content, type?, data?, files?, … }
 * @returns {Array<object>} mảng mới; tin không có khoá nặng được giữ NGUYÊN (cùng tham chiếu); không đổi mảng gốc
 */
export function slimChatHistory(history) {
  if (!Array.isArray(history)) return history;
  return history.map((message) => {
    const data = message?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return message;
    if (!HEAVY_LANDING_KEYS.some((key) => key in data)) return message;
    const slim = { ...data };
    for (const key of HEAVY_LANDING_KEYS) delete slim[key];
    return { ...message, data: slim };
  });
}
