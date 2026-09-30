/**
 * Sinh mã đơn hàng (`orderCode`) dùng chung cho mọi đường tạo đơn: mua gói (payment.service),
 * mua thêm (topup.service), admin tạo gói tuỳ chỉnh / gán gói (adminPlans.service).
 *
 * Ràng buộc:
 *   - PayOS nhận `orderCode` là số nguyên dương, tối đa 9007199254740991 (= Number.MAX_SAFE_INTEGER);
 *   - cột `orders.order_code` là BIGINT + UNIQUE (`orders_order_code_key`, migration 107);
 *   - mã e-invoice MTChieu = "UK" + mã, cắt 20 ký tự → mã tối đa 18 chữ số để không bị cắt.
 *
 * Dải mã: [10^15, 10^15 + 2^48 − 1) — luôn 16 chữ số, lớn hơn mọi mã sinh theo cách cũ
 * (Date.now(): 13 chữ số; Date.now()*100 + r: 15 chữ số) nên không trùng mã đã có. Phần ngẫu
 * nhiên 48 bit (trần của crypto.randomInt: max − min < 2^48): mã không suy ra được từ thời điểm
 * tạo đơn, và hai đơn tạo cùng lúc gần như không thể trùng mã (vẫn có UNIQUE chặn cuối).
 *
 * Đổi dạng mã thì PHẢI tạo thử một link thanh toán trên PayOS sandbox trước khi deploy.
 *
 * @module utils/payosOrderCode.util
 */
import crypto from 'crypto';

/** Trần `orderCode` của PayOS. */
export const PAYOS_ORDER_CODE_MAX = 9007199254740991;

/** Mã nhỏ nhất sinh ra (16 chữ số). */
export const ORDER_CODE_MIN = 1_000_000_000_000_000;

/** Số giá trị có thể sinh: 2^48 − 1 (crypto.randomInt yêu cầu max − min < 2^48). */
export const ORDER_CODE_RANDOM_SPAN = 2 ** 48 - 1;

/** Mã lớn nhất có thể sinh ra. */
export const ORDER_CODE_MAX = ORDER_CODE_MIN + ORDER_CODE_RANDOM_SPAN - 1;

/**
 * @returns {number} số nguyên an toàn trong [ORDER_CODE_MIN, ORDER_CODE_MAX]
 */
export function generatePayosOrderCode() {
  return crypto.randomInt(ORDER_CODE_MIN, ORDER_CODE_MIN + ORDER_CODE_RANDOM_SPAN);
}
