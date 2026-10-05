/**
 * MỘT định nghĩa "lần gọi AI tính vào tỉ lệ lỗi" cho mọi nơi đọc `ai_call_events` (luật cảnh báo ai_error_rate_high, ô giám sát admin): mẫu số là các lần gọi Google
 * thật đã có kết quả hoặc hết giờ; `client_closed` (khách đóng tab) và `blocked` (Google chặn nội dung) KHÔNG phải lỗi hệ thống nên không tính. Các nơi dùng chung
 * hằng này để số trên ô admin và số trong email cảnh báo không bao giờ lệch nhau.
 *
 * Là file riêng (không nằm trong repository) vì nhiều spec mock cả repository `aiCallEvent.repository.js` với vài export — thêm export vào đó làm module khác
 * import nó nổ "does not provide an export named …".
 */
export const AI_CALL_COUNTED_OUTCOMES = Object.freeze(['ok', 'fallback_ok', 'error', 'busy', 'timeout']);
export const AI_CALL_FAILED_OUTCOMES = Object.freeze(['error', 'busy', 'timeout']);

const sqlList = (values) => values.map((value) => `'${value}'`).join(', ');
export const AI_CALL_COUNTED_OUTCOMES_SQL = sqlList(AI_CALL_COUNTED_OUTCOMES);
export const AI_CALL_FAILED_OUTCOMES_SQL = sqlList(AI_CALL_FAILED_OUTCOMES);
