/**
 * Luật hiển thị thẻ cổng (wizard card) trong lịch sử hội thoại.
 *
 * Lúc chạy live, mỗi khi một thẻ cổng mới xuất hiện thì `stripWizardCards` bỏ thẻ trước đó —
 * nên người dùng không bao giờ thấy hai thẻ cổng chồng nhau.
 *
 * Đường dựng lại từ DB (F5 / mở lại phiên) trước đây không áp cùng luật, nên mọi thẻ cổng đã
 * trả lời đều hiện lại và xếp chồng. Câu trả lời thì là marker ẩn nên không thấy đâu — người
 * dùng chỉ thấy một chồng câu hỏi xám kèm nút mờ "Chọn hết các mục bên trên để tiếp tục",
 * đọc như thể trợ lý hỏi nhiều lần mà mình chưa làm gì. Bug thật 25/08/2026.
 */

/** Các loại tin nhắn trợ lý là THẺ CỔNG — hỏi để đi tiếp, không phải sản phẩm cuối. */
export const WIZARD_ASSISTANT_TYPES = new Set([
  'ask_campaign_details',
  'ask_sender_account',
  'email_setup_guide',
  'zalo_qr_login',
  'zalo_group_picker',
  'zalo_friend_picker',
  'suggest_content_plan',
]);

/**
 * Vị trí thẻ cổng CUỐI CÙNG trong danh sách — thẻ duy nhất còn được giữ nguyên hình dạng khi
 * dựng lại. Trả -1 nếu không có thẻ cổng nào.
 *
 * CỐ Ý không đụng tới `template_draft`, `content_plan`, `landing_page`, `confirm_create`:
 * đó là sản phẩm người dùng muốn xem lại, không phải câu hỏi đã trả lời xong.
 */
export function findLastWizardCardIndex(messages = []) {
  if (!Array.isArray(messages)) return -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant' && WIZARD_ASSISTANT_TYPES.has(message?.type)) return i;
  }
  return -1;
}

/**
 * Thẻ cổng ở vị trí này có được giữ nguyên không? Chỉ thẻ cuối cùng được giữ; các thẻ trước đó
 * đã trả lời rồi nên chỉ còn lại câu chữ, bỏ phần thẻ bấm được.
 */
export function shouldKeepWizardCard(message, index, lastWizardCardIndex) {
  if (message?.role !== 'assistant') return true;
  if (!WIZARD_ASSISTANT_TYPES.has(message?.type)) return true;
  return index === lastWizardCardIndex;
}
