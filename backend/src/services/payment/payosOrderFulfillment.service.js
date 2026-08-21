/**
 * Shared post-claim fulfillment for paid orders.
 * Used by webhook, PayOS reconcile cron, and payment-status poll.
 */
import { findPlanById } from '../../repositories/payment/plan.repository.js';
import {
  findUserIdByEmail,
  activateUserPlan,
} from '../../repositories/payment/payment.repository.js';
import { redeemVoucherForOrder } from '../../repositories/voucher.repository.js';
import { findActiveUserByEmail } from '../../repositories/user/user.repository.js';
import { sendSystemEmail, buildPaymentSuccessEmail } from '../../utils/systemEmail.util.js';
import { fulfillTopupOrder } from './topup.service.js';
import { prepareEinvoiceForPaidOrder } from './matbaoInvoice.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/**
 * Apply plan/top-up grants after an order was claimed to success.
 * Must run inside the same DB transaction as claimOrderSuccess when possible.
 * Always prepares durable einvoice intent before any early return (incl. top-up).
 *
 * @param {object} order row from claimOrderSuccess RETURNING
 * @param {import('pg').PoolClient} client
 * @returns {Promise<number|null>} einvoiceId when invoice intent exists
 */
export async function fulfillPaidOrder(order, client) {
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

  const isScheduled = order.note === 'scheduled_change';

  if (isScheduled) {
    if (userId && order.plan_id) {
      const { scheduledPlanChangeRepository } = await import('../../repositories/payment/scheduledPlanChange.repository.js');
      const existing = await scheduledPlanChangeRepository.findByOrderId(order.id, client);
      const user = await findActiveUserByEmail(order.user_email);
      const plan = await findPlanById(order.plan_id);
      const activateAfter = user?.subscription_expires_at ? new Date(user.subscription_expires_at) : new Date();

      if (!existing) {
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

      let invoiceInfo = order.invoice_info;
      if (typeof invoiceInfo === 'string') {
        try { invoiceInfo = JSON.parse(invoiceInfo); } catch { invoiceInfo = null; }
      }
      // deliverEmail, not wantInvoice: khách "không lấy hoá đơn" (consumer) vẫn có
      // wantInvoice: true (chỉ deliverEmail: false) — dùng wantInvoice ở đây từng làm
      // họ nhận nhầm khối "xem hoá đơn" dù không hề yêu cầu.
      const invoiceUrl = invoiceInfo?.deliverEmail !== false
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
        isScheduled: true,
        activateAfter,
      });
      sendSystemEmail({
        to: order.user_email,
        subject: email.subject,
        html: email.html,
      }).catch((err) => console.error('[PaymentSuccessEmail] Failed to send:', err.message));
    } else {
      console.warn(
        `[FulfillPaidOrder] Không tìm được user cho đơn hẹn ${order.order_code}`
      );
    }

    await redeemVoucherForOrder(order, client);
    return prepareEinvoiceForPaidOrder(order, client);
  }

  if (userId && order.plan_id) {
    let customConfig = order.custom_plan_config;
    if (typeof customConfig === 'string') {
      try { customConfig = JSON.parse(customConfig); } catch { customConfig = null; }
    }
    if (customConfig && typeof customConfig === 'object') {
      const { updateCustomPlanLimits } = await import('../../repositories/payment/customPlan.repository.js');
      await updateCustomPlanLimits(order.plan_id, customConfig, client);
    }

    await activateUserPlan(userId, order.plan_id, order.billing_period || 'monthly', client);

    // Trần vừa tăng trở lại — mở khoá tài nguyên đã bị khoá khi gói hết hạn
    const { reconcileResourceLocks } = await import('./topupLock.service.js');
    await reconcileResourceLocks(userId, client, { unlockOnly: true });

    const user = await findActiveUserByEmail(order.user_email);
    const plan = await findPlanById(order.plan_id);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (plan?.duration_days || 30));

    let invoiceInfo = order.invoice_info;
    if (typeof invoiceInfo === 'string') {
      try { invoiceInfo = JSON.parse(invoiceInfo); } catch { invoiceInfo = null; }
    }
    // deliverEmail, not wantInvoice — see comment on the scheduled-order branch above.
    const invoiceUrl = invoiceInfo?.deliverEmail !== false
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
    });
    sendSystemEmail({
      to: order.user_email,
      subject: email.subject,
      html: email.html,
    }).catch((err) => console.error('[PaymentSuccessEmail] Failed to send:', err.message));
  } else {
    console.warn(
      `[FulfillPaidOrder] Không tìm được user cho đơn ${order.order_code} — plan chưa được kích hoạt`
    );
  }

  await redeemVoucherForOrder(order, client);
  return prepareEinvoiceForPaidOrder(order, client);
}
