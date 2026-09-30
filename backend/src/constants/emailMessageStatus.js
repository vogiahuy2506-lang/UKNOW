/**
 * Trạng thái `email_messages.status` của một thư MÁY CHỦ SMTP ĐÃ NHẬN ("email đã gửi").
 * MỘT hằng duy nhất cho mọi phép đếm hạn mức / giới hạn gửi (ngày, kỳ, tài khoản, nhân viên).
 *
 * Vì sao phải đủ 7 giá trị, không phải 3 (sent / delivered / bounced): `status` ĐI TIẾP sau khi gửi —
 * khách mở thư → 'opened', nhấp link → 'clicked', bấm huỷ đăng ký → 'unsubscribed'
 * (customerEmailTracking.repository.js), còn bounce / spam đến sau → 'bounced' / 'spam'. Lọc theo bộ 3
 * thì thư đã gửi rơi khỏi phép đếm ngay khi khách mở nó: đo production tháng 9/2026 hạn mức đếm thiếu
 * ~22%, khách gửi được nhiều hơn hạn mức đã mua. Đừng "sửa" bằng cách lọc `status = 'sent'` — thiếu
 * đúng chừng đó.
 *
 * KHÔNG gồm 'pending', 'queued' (chưa gửi) và 'failed': `sent_at` được ghi NGAY LÚC GỬI THỬ, kể cả khi
 * thất bại (xem countEmailSentTodayByAccount ở sendQuota.repository.js), nên bỏ bộ lọc status là đếm cả
 * thư lỗi vào hạn mức.
 *
 * Trên production `status` là enum `message_status` (bootstrap.sql khai VARCHAR — lệch): `IN (literal…)`
 * được Postgres tự ép về enum, còn `= ANY($1::text[])` thì lỗi "enum = text". Vì vậy xuất CHUỖI literal
 * dựng sẵn cho SQL, không xuất mảng để bind tham số.
 *
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-1.
 */
export const EMAIL_SENT_STATUSES = Object.freeze([
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'spam',
  'unsubscribed',
]);

/**
 * Dạng dùng trong SQL: `AND em.status IN ${EMAIL_SENT_STATUS_SQL_LIST}` (đã kèm ngoặc).
 * Dựng từ mảng ở trên — chỉ chứa chữ thường/gạch dưới do mã này khai, không có đầu vào người dùng.
 */
export const EMAIL_SENT_STATUS_SQL_LIST = `(${EMAIL_SENT_STATUSES.map((status) => `'${status}'`).join(', ')})`;
