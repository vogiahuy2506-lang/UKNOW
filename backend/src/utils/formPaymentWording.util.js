import { resolvePaymentPurpose } from './formDefinition.util.js';

/**
 * Chữ người mua thấy trong thư/lỗi theo cách chủ biểu mẫu gọi khoản tiền
 * (`payment_config.purpose` / `payment_snapshot.purpose`). Thiếu hoặc sai -> 'hold'
 * (bài nộp cũ không có purpose vẫn ra chữ "giữ chỗ").
 */
const WORDING = Object.freeze({
  hold: Object.freeze({
    emailHeading: 'Vui lòng chuyển khoản để giữ chỗ',
    emailDeadlineLabel: 'Hạn giữ chỗ',
    tooManyPending:
      'Bạn đang có quá nhiều lượt giữ chỗ chưa thanh toán cho biểu mẫu này. Vui lòng hoàn tất hoặc chờ hết hạn giữ chỗ trước khi thử lại.',
  }),
  order: Object.freeze({
    emailHeading: 'Vui lòng chuyển khoản để hoàn tất đơn hàng',
    emailDeadlineLabel: 'Hạn thanh toán',
    tooManyPending:
      'Bạn đang có quá nhiều đơn chưa thanh toán cho biểu mẫu này. Vui lòng hoàn tất hoặc chờ hết hạn thanh toán trước khi thử lại.',
  }),
  deposit: Object.freeze({
    emailHeading: 'Vui lòng chuyển khoản để đặt cọc',
    emailDeadlineLabel: 'Hạn đặt cọc',
    tooManyPending:
      'Bạn đang có quá nhiều lượt đặt cọc chưa chuyển khoản cho biểu mẫu này. Vui lòng hoàn tất hoặc chờ hết hạn đặt cọc trước khi thử lại.',
  }),
});

/**
 * @param {unknown} purpose
 * @returns {{ emailHeading: string, emailDeadlineLabel: string, tooManyPending: string }}
 */
export function getPaymentWording(purpose) {
  return WORDING[resolvePaymentPurpose(purpose)];
}
