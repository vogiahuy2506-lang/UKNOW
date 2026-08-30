/**
 * Shared post-claim fulfillment for paid orders.
 * Used by webhook, PayOS reconcile cron, and payment-status poll.
 */
import { findPlanById } from '../../repositories/payment/plan.repository.js';
import {
  findUserIdByEmail,
  activateUserPlan,
  lockUserForPaidPlanFulfillment,
  findNewerSuccessfulPlanEntitlement,
  findNewerSuccessfulPlanCheckout,
} from '../../repositories/payment/payment.repository.js';
import { redeemVoucherForOrder } from '../../repositories/voucher.repository.js';
import { findUserById, lockUserForPlanActivation } from '../../repositories/user/user.repository.js';
import { sendSystemEmail, buildPaymentSuccessEmail } from '../../utils/systemEmail.util.js';
import { fulfillTopupOrder } from './topup.service.js';
import { prepareEinvoiceForPaidOrder } from './matbaoInvoice.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/**
 * Email is intentionally non-blocking, but it must not start until the order
 * transaction commits. Registering a callback keeps a later voucher/invoice
 * failure from telling the customer that a rolled-back payment succeeded.
 */
function deferPaymentSuccessEmail(email, registerAfterCommit) {
  if (typeof registerAfterCommit !== 'function') return;

  registerAfterCommit(() => {
    try {
      Promise.resolve(sendSystemEmail({
        to: email.to,
        subject: email.subject,
        html: email.html,
      })).catch((err) => console.error('[PaymentSuccessEmail] Failed to send:', err.message));
    } catch (err) {
      console.error('[PaymentSuccessEmail] Failed to queue:', err.message);
    }
  });
}

/**
 * Apply plan/top-up grants after an order was claimed to success.
 * Must run inside the same DB transaction as claimOrderSuccess when possible.
 * Always prepares durable einvoice intent before any early return (incl. top-up).
 *
 * @param {object} order row from claimOrderSuccess RETURNING
 * @param {import('pg').PoolClient} client
 * @param {{ registerAfterCommit?: (callback: () => void) => void }} [options]
 * @returns {Promise<number|null>} einvoiceId when invoice intent exists
 */
export async function fulfillPaidOrder(order, client, { registerAfterCommit } = {}) {
  if (!order) return null;

  const isTopup = order.note === 'topup' || order.topup_config != null;

  if (isTopup) {
    await fulfillTopupOrder(order, client);
    console.log(`[FulfillPaidOrder] Top-up order ${order.order_code} granted`);
    // Prepare BEFORE return — legacy top-up with VAT must not skip durable intent.
    return prepareEinvoiceForPaidOrder(order, client);
  }

  const userId = order.user_id
    || (order.user_email ? await findUserIdByEmail(order.user_email) : null);

  // claimOrderSuccess và fulfillPaidOrder phải cùng transaction. Nếu không xác
  // định được entitlement target thì phải throw để caller rollback trạng thái
  // `success`; không được ghi nhận tiền rồi để user không có gói.
  if (!userId || !order.plan_id) {
    throw new Error(
      `[FulfillPaidOrder] Không thể kích hoạt gói cho đơn ${order.order_code}: thiếu user hoặc plan hợp lệ.`
    );
  }

  const isScheduled = order.note === 'scheduled_change';

  if (isScheduled) {
    const { scheduledPlanChangeRepository } = await import('../../repositories/payment/scheduledPlanChange.repository.js');
    // Use the same account-level lock as direct fulfillment and the due worker.
    // Without it, two simultaneous scheduled webhooks can both see no pending
    // change, then race the partial unique index (or let an older webhook
    // supersede a newer checkout).
    const lockedUser = await lockUserForPlanActivation(userId, client);
    if (!lockedUser) {
      throw new Error(
        `[FulfillPaidOrder] Không thể hẹn kích hoạt gói cho đơn ${order.order_code}: không tìm thấy tài khoản ${userId}.`
      );
    }

    const existing = await scheduledPlanChangeRepository.findByOrderId(order.id, client);
    const newerCheckout = existing
      ? null
      : await findNewerSuccessfulPlanCheckout({
        userId,
        orderId: order.id,
        queryable: client,
      });
    // `userId` is the entitlement target resolved from the order.  Do not look
    // it up by email here: email can change, and findActiveUserByEmail only
    // exposes an id (not the expiry needed to defer a downgrade).
    const user = await findUserById(userId, client);
    const plan = await findPlanById(order.plan_id);
    const activateAfter = user?.subscription_expires_at ? new Date(user.subscription_expires_at) : new Date();

    const entitlementSuperseded = Boolean(newerCheckout);
    if (!existing && !entitlementSuperseded) {
      const pendingBefore = await scheduledPlanChangeRepository.findPendingByUserId(userId, client);
      const previousPaid = pendingBefore ? Number(pendingBefore.amount_paid || 0) : 0;
      const totalAmountPaid = previousPaid + Number(order.amount || 0);

      await scheduledPlanChangeRepository.supersedePendingByUserId(userId, client);
      await scheduledPlanChangeRepository.create({
        userId,
        planId: order.plan_id,
        billingPeriod: order.billing_period || 'monthly',
        orderId: order.id,
        amountPaid: totalAmountPaid,
        activateAfter,
      }, client);
    }

    if (entitlementSuperseded) {
      console.warn(
        `[FulfillPaidOrder] Scheduled order ${order.order_code} arrived after newer successful checkout `
        + `${newerCheckout.newer_successful_order_code}; retaining the newer checkout intent.`
      );
    }

    let invoiceInfo = order.invoice_info;
    if (typeof invoiceInfo === 'string') {
      try { invoiceInfo = JSON.parse(invoiceInfo); } catch { invoiceInfo = null; }
    }
    // Cần CẢ wantInvoice === true (có ý định lấy hoá đơn — invoice_info null/thiếu
    // trường này thì không có) LẪN deliverEmail !== false (không phải diện consumer
    // "không lấy hoá đơn"). Chỉ check deliverEmail từng cho invoiceUrl xuất hiện khi
    // invoice_info là null (vd INVOICE_VAT_ENABLED=false) vì undefined !== false → true.
    const invoiceUrl = (invoiceInfo?.wantInvoice === true && invoiceInfo?.deliverEmail !== false)
      ? `${FRONTEND_URL}/invoices/${order.order_code}`
      : undefined;

    const email = buildPaymentSuccessEmail({
      fullName: user?.full_name,
      email: order.user_email,
      planName: plan?.name || 'Unknown Plan',
      amount: order.amount,
      billingPeriod: order.billing_period || 'monthly',
      orderCode: order.order_code,
      paymentMethod: order.payment_method,
      invoiceUrl,
      isScheduled: !entitlementSuperseded,
      activateAfter,
      isEntitlementSuperseded: entitlementSuperseded,
      activePlanName: entitlementSuperseded && user?.active_plan_id
        ? (await findPlanById(user.active_plan_id))?.name || null
        : null,
    });
    deferPaymentSuccessEmail({
      to: order.user_email,
      subject: email.subject,
      html: email.html,
    }, registerAfterCommit);

    await redeemVoucherForOrder(order, client);
    return prepareEinvoiceForPaidOrder(order, client);
  }

  // The user row is the serialization point for entitlement writes. A later
  // checkout may be paid before this webhook arrives; in that case retain the
  // newer entitlement while still recording this payment, voucher and invoice.
  const fulfillmentLock = await lockUserForPaidPlanFulfillment({
    userId,
    queryable: client,
  });
  if (!fulfillmentLock) {
    throw new Error(
      `[FulfillPaidOrder] Không thể kích hoạt gói cho đơn ${order.order_code}: không tìm thấy tài khoản ${userId}.`
    );
  }

  // This must be a second statement after the row lock: Read Committed takes
  // the first statement's snapshot before a lock wait, so a combined
  // lock+orders query can miss the checkout that just committed.
  const newerEntitlement = await findNewerSuccessfulPlanEntitlement({
    userId,
    orderId: order.id,
    queryable: client,
  });
  const entitlementSuperseded = Boolean(newerEntitlement?.newer_successful_order_id);
  let activation = null;

  if (entitlementSuperseded) {
    console.warn(
      `[FulfillPaidOrder] Order ${order.order_code} paid after newer successful order `
      + `${newerEntitlement.newer_successful_order_code}; retaining the newer entitlement.`
    );
  } else {
    let customConfig = order.custom_plan_config;
    if (typeof customConfig === 'string') {
      try { customConfig = JSON.parse(customConfig); } catch { customConfig = null; }
    }
    if (customConfig && typeof customConfig === 'object') {
      const { updateCustomPlanLimits } = await import('../../repositories/payment/customPlan.repository.js');
      await updateCustomPlanLimits(order.plan_id, customConfig, client);
    }

    activation = await activateUserPlan(userId, order.plan_id, order.billing_period || 'monthly', client);
    // Repository cũng throw khi UPDATE không trả row. Giữ check này để bảo vệ
    // invariant ở orchestration layer khi mock/adapter không tuân thủ contract.
    if (!activation) {
      throw new Error(
        `[FulfillPaidOrder] Không thể kích hoạt gói cho đơn ${order.order_code}: activation không trả entitlement.`
      );
    }

    // Trần vừa tăng trở lại — mở khoá tài nguyên đã bị khoá khi gói hết hạn
    const { reconcileResourceLocks } = await import('./topupLock.service.js');
    await reconcileResourceLocks(userId, client, { unlockOnly: true });
  }

  const user = await findUserById(userId, client);
  const plan = await findPlanById(order.plan_id);
  const expiresAt = activation?.subscription_expires_at
    ? new Date(activation.subscription_expires_at)
    : (user?.subscription_expires_at ? new Date(user.subscription_expires_at) : null);
  const activePlan = entitlementSuperseded && user?.active_plan_id
    ? await findPlanById(user.active_plan_id)
    : null;

  let invoiceInfo = order.invoice_info;
  if (typeof invoiceInfo === 'string') {
    try { invoiceInfo = JSON.parse(invoiceInfo); } catch { invoiceInfo = null; }
  }
  // wantInvoice === true AND deliverEmail !== false — see comment on the
  // scheduled-order branch above (null invoice_info must not leak invoiceUrl).
  const invoiceUrl = (invoiceInfo?.wantInvoice === true && invoiceInfo?.deliverEmail !== false)
    ? `${FRONTEND_URL}/invoices/${order.order_code}`
    : undefined;

  const email = buildPaymentSuccessEmail({
    fullName: user?.full_name,
    email: order.user_email,
    planName: plan?.name || 'Unknown Plan',
    amount: order.amount,
    billingPeriod: order.billing_period || 'monthly',
    orderCode: order.order_code,
    paymentMethod: order.payment_method,
    expiresAt,
    invoiceUrl,
    isEntitlementSuperseded: entitlementSuperseded,
    activePlanName: activePlan?.name || null,
  });
  deferPaymentSuccessEmail({
    to: order.user_email,
    subject: email.subject,
    html: email.html,
  }, registerAfterCommit);

  await redeemVoucherForOrder(order, client);
  return prepareEinvoiceForPaidOrder(order, client);
}
