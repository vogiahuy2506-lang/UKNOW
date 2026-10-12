import {
  findAbandonedOrdersForReminder,
  markPaymentReminderSent,
  findReorderInfo,
} from '../../repositories/payment/payment.repository.js';
import { findPlanById } from '../../repositories/payment/plan.repository.js';
import { notifyUsers } from '../notification/notificationDispatch.service.js';
import { loadCustomSystemEmailTemplate } from '../email/welcomeEmailTemplate.service.js';
import {
  buildCheckoutReorderUrl,
  buildOrderPaymentReminderEmail,
} from '../../utils/systemEmail.util.js';

/**
 * Nhắc thanh toán lại đơn gói bỏ dở (PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO_2026-10-12 PR-A).
 *
 * Khách chọn gói, điền thông tin, nhưng không trả tiền: link PayOS sống ~20 phút, cron đối soát (payosReconcile.service.js) thấy
 * EXPIRED/CANCELLED thì huỷ đơn kèm note `[OPS] PayOS …`. ~2 giờ sau đơn đó, service này gửi MỘT thư + MỘT chuông kèm đường dẫn
 * `/checkout?order=<mã đơn>` — trang checkout đọc đơn cũ (GET /api/payments/orders/:orderCode/reorder) rồi tạo đơn + link PayOS MỚI.
 *
 * KHÔNG đặt link PayOS vào thư (đã chết sau 20 phút) và KHÔNG tái dùng order_code cũ: mỗi lần thanh toán lại là một đơn mới.
 *
 * Chọn đơn nào để nhắc nằm hết trong `findAbandonedOrdersForReminder` (đọc chú thích ở đó: vì sao không có `pending`, không có `failed`).
 */

const BILLING_PERIOD_LABEL = Object.freeze({
  monthly: 'thanh toán theo tháng',
  yearly: 'thanh toán theo năm',
});

/** Cron 15 phút một lần: lượt chậm chồng lên lượt kế tiếp thì lượt sau bỏ qua (tránh gửi đôi khi chuông bị admin tắt nên không có khoá chống trùng). */
let isRunning = false;

/** Dispatcher không ném lỗi: chỉ coi là hỏng khi email lỗi mà chuông cũng không ghi được (cùng luật subscriptionExpiry.service.js). */
function isDeliveryFailure(delivery) {
  return delivery.emailFailed > 0 && delivery.inApp + delivery.emailSent === 0;
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Quét và nhắc các đơn bỏ dở đến hạn. Mỗi đơn tối đa MỘT lần: chỉ `markPaymentReminderSent` sau khi chuông hoặc thư ghi/gửi được
 * (hoặc không kênh nào cần gửi vì khách tắt email + admin tắt chuông — vẫn đóng đơn, đừng quét lại mãi). Hỏng hoàn toàn thì KHÔNG đánh dấu,
 * lượt cron sau thử lại trong cửa sổ 72 giờ.
 *
 * @param {{ baseUrl?: string, olderThanMinutes?: number, newerThanHours?: number, limit?: number }} [options]
 *   baseUrl: gốc URL FE (mặc định FRONTEND_URL — cùng cách dựng với buildRenewalUrl)
 * @returns {Promise<{ scanned: number, sent: number, skipped: number, failed: number }>}
 */
export async function sendAbandonedCheckoutReminders({
  baseUrl,
  olderThanMinutes,
  newerThanHours,
  limit,
} = {}) {
  const result = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  if (isRunning) return result;
  isRunning = true;
  try {
    const orders = await findAbandonedOrdersForReminder({ olderThanMinutes, newerThanHours, limit });
    result.scanned = orders.length;
    if (!orders.length) return result;

    // Một lần cho cả lượt: mẫu tuỳ chỉnh của super admin (null = mẫu mặc định trong code).
    const template = await loadCustomSystemEmailTemplate('order_payment_reminder');

    for (const order of orders) {
      try {
        const orderCode = String(order.order_code);
        const planName = order.plan_name || 'dịch vụ';
        const payUrl = buildCheckoutReorderUrl(orderCode, baseUrl);
        const delivery = await notifyUsers({
          eventType: 'order_payment_reminder',
          userIds: [order.user_id],
          title: `Hoàn tất thanh toán gói ${planName}`,
          titleEn: `Complete your ${planName} plan payment`,
          message: `Đơn ${orderCode} chưa được thanh toán. Bấm để thanh toán lại — link mới có hiệu lực ngay.`,
          messageEn: `Order ${orderCode} hasn't been paid yet. Click to pay again — a fresh payment link is ready right away.`,
          link: `/checkout?order=${orderCode}`,
          severity: 'info',
          metadata: {
            orderId: order.id,
            orderCode,
            planName: order.plan_name || null,
            billingPeriod: order.billing_period || null,
          },
          dedupeKey: `order_payment_reminder:${order.id}`,
          email: ({ fullName }) => buildOrderPaymentReminderEmail({
            fullName,
            planName: order.plan_name,
            billingPeriodLabel: BILLING_PERIOD_LABEL[order.billing_period] || '',
            amount: order.amount,
            orderCode,
            payUrl,
            template,
          }),
        });

        if (isDeliveryFailure(delivery)) {
          throw new Error(`notify_failed emailFailed=${delivery.emailFailed}`);
        }
        await markPaymentReminderSent(order.id);
        if (delivery.inApp + delivery.emailSent > 0) result.sent += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        console.error(
          `[AbandonedCheckout] Nhắc thanh toán lại đơn ${order.order_code} thất bại (lượt sau thử lại):`,
          error?.message || error
        );
      }
    }
    return result;
  } finally {
    isRunning = false;
  }
}

/**
 * Dữ liệu để trang checkout dựng lại một lần thanh toán từ đơn cũ (`/checkout?order=<mã>`).
 *
 * - đơn không tồn tại hoặc KHÔNG phải của `userId` → 404 `ORDER_NOT_FOUND` (không phân biệt, không lộ mã đơn của người khác);
 * - đơn đã `success` → 409 `ORDER_ALREADY_PAID`;
 * - đơn gói tự chọn / nạp thêm → 422 `ORDER_NOT_REORDERABLE` (đợt này chỉ gói thường);
 * - gói không còn bán → 410 `PLAN_UNAVAILABLE`.
 *
 * `plan` là nguyên dòng `plans` (cùng hình dạng GET /api/plans) để CheckoutPage dùng y như khi đi từ trang giá.
 * `billingPeriod` rơi về 'monthly' nếu gói không còn giá năm — createPaymentLink từ chối kỳ năm khi gói không bán theo năm.
 *
 * @param {string|number} orderCode
 * @param {number|string} userId
 * @returns {Promise<{ plan: object, billingPeriod: 'monthly'|'yearly', voucherCode: string|null, orderStatus: string }>}
 */
export async function getReorderInfoForOwner(orderCode, userId) {
  const order = await findReorderInfo(orderCode, userId);
  if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');
  if (order.status === 'success') {
    throw httpError(409, 'ORDER_ALREADY_PAID', 'Đơn này đã được thanh toán');
  }
  if (order.is_custom_plan || order.is_topup || !order.plan_id) {
    throw httpError(422, 'ORDER_NOT_REORDERABLE', 'Đơn này không thể thanh toán lại — vui lòng chọn gói từ trang bảng giá');
  }
  const plan = await findPlanById(order.plan_id);
  if (!plan || plan.is_active !== true || plan.is_custom === true) {
    throw httpError(410, 'PLAN_UNAVAILABLE', 'Gói trong đơn này hiện không còn bán');
  }
  const billingPeriod = order.billing_period === 'yearly' && Number(plan.price_yearly) > 0 ? 'yearly' : 'monthly';
  return {
    plan,
    billingPeriod,
    voucherCode: order.voucher_code || null,
    orderStatus: order.status,
  };
}
