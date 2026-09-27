import db from '../../config/database.js';
import {
  findOrderForRefund,
  lockOrderForRefund,
  findPendingScheduledPlanChange,
  findEinvoiceStatusForOrder,
  markOrderRefunded,
  cancelUnissuedEinvoiceForRefund,
} from '../../repositories/admin/adminOrderRefund.repository.js';
import {
  findActiveUserByEmail,
  lockUserForPlanActivation,
} from '../../repositories/user/user.repository.js';
import { expireUserPlan } from '../../repositories/subscription/subscription.repository.js';
import { findCurrentPlanActivation } from '../../utils/billingCycle.util.js';
import { reconcileResourceLocks } from '../payment/topupLock.service.js';

// PLAN_HOAN_TIEN_DON_HANG_2026-09-27 mục 1.3 — admin GHI NHẬN một đơn đã được kế toán chuyển
// khoản hoàn tay, và làm các việc đi kèm trong MỘT transaction: đơn → 'refunded', thu gói nếu đơn
// này là gói hiện hành, chặn hoá đơn chưa xuất. Hệ thống KHÔNG tự chuyển tiền trả khách.
// Hoàn = toàn bộ đơn (không có hoàn một phần).

const MAX_REASON_LENGTH = 2000;
const MAX_TRANSFER_REF_LENGTH = 200;

function httpError(status, code, message, details) {
  const err = { status, code, message };
  if (details) err.details = details;
  return err;
}

// Cùng điều kiện "đơn mua thêm" với billingCycle.util.js (latest_direct_order).
function isTopupOrder(order) {
  return order.topup_config != null || order.note === 'topup';
}

// Khách trả tiền cho đơn đã huỷ/lỗi (payment.service.js handleWebhook gắn tag). Tag
// PAID_AFTER_CANCELLED_HANDLED cũng chứa chuỗi này — admin đánh dấu đã xử lý không có nghĩa tiền
// chưa từng vào, nên vẫn cho hoàn.
function hasPaidAfterCancelledTag(order) {
  return String(order.note || '').includes('PAID_AFTER_CANCELLED');
}

/**
 * Luật đủ điều kiện, dùng chung cho preview và lệnh hoàn (lệnh hoàn chạy lại trên dòng ĐÃ KHOÁ).
 * @returns {{ kind: 'paid'|'paid_after_cancelled' }} hoặc ném httpError.
 */
function assertRefundable(order) {
  if (order.status === 'refunded') {
    throw httpError(409, 'ALREADY_REFUNDED', 'Đơn này đã được hoàn tiền trước đó');
  }
  if (isTopupOrder(order)) {
    throw httpError(
      400,
      'TOPUP_NOT_SUPPORTED',
      'Chưa hỗ trợ hoàn tiền đơn mua thêm — thu hồi lượt mua thêm cần xử lý tay'
    );
  }
  if (order.status === 'success') {
    if (!(Number(order.amount) > 0)) {
      throw httpError(400, 'ZERO_AMOUNT', 'Đơn 0đ không có tiền để hoàn');
    }
    if (['free', 'voucher'].includes(order.payment_method)) {
      throw httpError(400, 'NOT_PAID', 'Đơn kích hoạt miễn phí / voucher 100% không có tiền để hoàn');
    }
    return { kind: 'paid' };
  }
  if (['cancelled', 'failed'].includes(order.status) && hasPaidAfterCancelledTag(order)) {
    return { kind: 'paid_after_cancelled' };
  }
  throw httpError(
    400,
    'NOT_REFUNDABLE',
    `Chỉ hoàn được đơn đã thanh toán thành công hoặc đơn đã huỷ mà khách vẫn trả tiền (trạng thái hiện tại: ${order.status})`
  );
}

function describeEinvoice(einvoice) {
  if (!einvoice) return { einvoice: 'none', einvoiceId: null, einvoiceStatusBefore: null };
  const base = { einvoiceId: Number(einvoice.id), einvoiceStatusBefore: einvoice.status };
  switch (einvoice.status) {
    case 'pending':
    case 'failed':
      return { ...base, einvoice: 'cancelled' };
    case 'issued':
    case 'cqt_ok':
      return { ...base, einvoice: 'needs_adjustment' };
    case 'processing':
      // Mắt Bão có thể đang phát hành — worker chặn lượt nhặt lại, kế toán kiểm kết quả.
      return { ...base, einvoice: 'in_flight' };
    default:
      return { ...base, einvoice: 'untouched' };
  }
}

async function resolveOrderUserId(order, queryable) {
  if (order.user_id) return Number(order.user_id);
  if (!order.user_email) return null;
  const user = await findActiveUserByEmail(order.user_email, queryable);
  return user?.id ? Number(user.id) : null;
}

/**
 * Hệ quả của lệnh hoàn, tính TRƯỚC khi đổi trạng thái đơn: findCurrentPlanActivation chỉ tìm đơn
 * status IN ('paid','success','completed'), nên gọi sau UPDATE 'refunded' là không còn thấy chính
 * đơn này → luôn ra 'untouched' và khách giữ gói (lệch thứ tự so với plan gốc, đã báo 27/09).
 */
async function evaluateConsequences({ order, kind, userId }, queryable) {
  let plan = 'not_applicable';
  if (kind === 'paid') {
    if (!userId) {
      plan = 'no_user';
    } else {
      const activation = await findCurrentPlanActivation(userId, queryable);
      plan = activation && String(activation.checkout_order_id) === String(order.id)
        ? 'revoked'
        : 'untouched';
    }
  }
  const einvoiceRow = await findEinvoiceStatusForOrder(order.id, queryable);
  return {
    kind,
    plan,
    planId: plan === 'revoked' ? order.plan_id : null,
    ...describeEinvoice(einvoiceRow),
  };
}

async function assertNoPendingPlanChange(kind, userId, queryable) {
  if (kind !== 'paid' || !userId) return;
  const pending = await findPendingScheduledPlanChange(userId, queryable);
  if (pending) {
    throw httpError(
      400,
      'PENDING_PLAN_CHANGE',
      `Khách đang có lịch đổi gói chờ áp dụng (#${pending.id}) — xử lý lịch đổi gói bằng tay trước khi hoàn tiền`,
      { scheduledPlanChangeId: pending.id }
    );
  }
}

/**
 * GET preview — cùng luật với refundOrder nhưng KHÔNG ghi, KHÔNG khoá. Chỉ để hiển thị modal;
 * refundOrder kiểm lại mọi điều kiện trên dòng đã khoá.
 */
export async function previewRefund(orderCode) {
  const order = await findOrderForRefund(orderCode);
  if (!order) throw httpError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

  const summary = {
    orderCode: String(order.order_code),
    amount: Math.round(Number(order.amount || 0)),
    status: order.status,
  };
  try {
    const { kind } = assertRefundable(order);
    const userId = await resolveOrderUserId(order, db);
    await assertNoPendingPlanChange(kind, userId, db);
    const consequences = await evaluateConsequences({ order, kind, userId }, db);
    return { ...summary, eligible: true, ...consequences, affiliate: null };
  } catch (err) {
    if (err && err.status && err.status < 500 && err.code !== 'NOT_FOUND') {
      return { ...summary, eligible: false, code: err.code, reason: err.message };
    }
    throw err;
  }
}

/**
 * POST refund — ghi nhận hoàn tiền toàn bộ đơn.
 * Thứ tự khoá giống webhook (payment.service.js handleWebhook): user → order.
 */
export async function refundOrder({
  orderCode, adminUserId, reason, transferRef = null,
}) {
  const trimmedReason = String(reason ?? '').trim();
  if (!trimmedReason) throw httpError(400, 'REASON_REQUIRED', 'Vui lòng nhập lý do hoàn tiền');
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw httpError(400, 'REASON_TOO_LONG', `Lý do tối đa ${MAX_REASON_LENGTH} ký tự`);
  }
  const trimmedTransferRef = transferRef == null ? '' : String(transferRef).trim();
  if (trimmedTransferRef.length > MAX_TRANSFER_REF_LENGTH) {
    throw httpError(400, 'TRANSFER_REF_TOO_LONG', `Mã giao dịch tối đa ${MAX_TRANSFER_REF_LENGTH} ký tự`);
  }

  const client = await db.getClient();
  let result;
  let revokedUserId = null;
  try {
    await client.query('BEGIN');

    const unlocked = await findOrderForRefund(orderCode, client);
    if (!unlocked) throw httpError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

    const userId = await resolveOrderUserId(unlocked, client);
    if (userId) await lockUserForPlanActivation(userId, client);

    const order = await lockOrderForRefund(orderCode, client);
    if (!order) throw httpError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

    const { kind } = assertRefundable(order);
    await assertNoPendingPlanChange(kind, userId, client);
    const consequences = await evaluateConsequences({ order, kind, userId }, client);

    const meta = {
      ...consequences,
      amount: Math.round(Number(order.amount || 0)),
      statusBefore: order.status,
      transferRef: trimmedTransferRef || null,
      affiliate: null,
    };

    const updated = await markOrderRefunded({
      orderId: order.id,
      expectedStatus: order.status,
      refundedBy: adminUserId,
      reason: trimmedReason,
      meta,
    }, client);
    if (!updated) {
      throw httpError(409, 'CONCURRENT_UPDATE', 'Đơn vừa được xử lý ở nơi khác — tải lại rồi thử lại');
    }

    if (consequences.plan === 'revoked') {
      await expireUserPlan(userId, client);
      revokedUserId = userId;
    }
    if (consequences.einvoice === 'cancelled') {
      await cancelUnissuedEinvoiceForRefund(order.id, client);
    }

    await client.query('COMMIT');
    result = {
      orderId: order.id,
      orderCode: String(order.order_code),
      userId,
      refundedAt: updated.refunded_at,
      meta,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // SAU commit, như luồng hết hạn (subscriptionExpiry.service.js): lỗi khoá tài nguyên không được
  // rollback lệnh hoàn đã ghi. reconcileResourceLocks đọc trần từ users.max_* vừa bị expireUserPlan
  // đặt về 0 nên phải chạy sau khi gỡ gói.
  if (revokedUserId) {
    try {
      await reconcileResourceLocks(revokedUserId);
    } catch (lockErr) {
      console.error(`[AdminOrderRefund] Khoá tài nguyên thất bại cho user #${revokedUserId} sau khi hoàn đơn ${orderCode}:`, lockErr.message);
    }
  }

  return result;
}
