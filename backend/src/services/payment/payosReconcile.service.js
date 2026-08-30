/**
 * PayOS reconcile / status-poll helpers.
 * Shares claim + fulfillPaidOrder with the webhook path.
 */
import db from '../../config/database.js';
import payosClient from '../../utils/payos.util.js';
import {
  claimOrderSuccess,
  markOrderFailedForReview,
  findPendingPayosOrdersSinceHours,
  findStalePendingPayosOrders,
  cancelPendingOrderWithNote,
  findOrderByCode,
} from '../../repositories/payment/payment.repository.js';
import { fulfillPaidOrder } from './payosOrderFulfillment.service.js';
import { scheduleDispatchEinvoiceAfterCommit } from './matbaoInvoice.service.js';
import {
  findActiveUserByEmail,
  lockUserForPlanActivation,
} from '../../repositories/user/user.repository.js';

export const PAYOS_RECONCILE_JOB_CODE = 'payos_order_reconcile';
export const PAYOS_EXPIRE_JOB_CODE = 'payos_order_expire';
export const PAYOS_RECONCILE_WINDOW_HOURS = 48;
export const PAYOS_EXPIRE_AFTER_HOURS = 72;

function amountsMatch(orderAmount, paidAmount) {
  if (paidAmount == null) return false;
  return Number(paidAmount) === Number(orderAmount);
}

/**
 * Claim + fulfill when PayOS reports PAID with matching amount.
 * @returns {'fulfilled'|'amount_mismatch'|'not_claimed'|'error'}
 */
export async function claimAndFulfillFromPayos({ order, amountPaid, source = 'reconcile' }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const fresh = await findOrderByCode(order.order_code, client);
    if (!fresh || fresh.status !== 'pending') {
      await client.query('COMMIT');
      return 'not_claimed';
    }

    if (!amountsMatch(fresh.amount, amountPaid)) {
      const note =
        `[OPS] AMOUNT_MISMATCH expected=${fresh.amount} got=${amountPaid} `
        + `via ${source} at ${new Date().toISOString()}`;
      await markOrderFailedForReview(fresh.order_code, note, client);
      await client.query('COMMIT');
      console.error(
        `[PayOSReconcile] Amount mismatch — order ${fresh.order_code} marked failed. ${note}`
      );
      return 'amount_mismatch';
    }

    const fulfillmentUserId = fresh.user_id || (
      fresh.user_email ? (await findActiveUserByEmail(fresh.user_email, client))?.id : null
    );
    if (fulfillmentUserId) {
      const lockedUser = await lockUserForPlanActivation(fulfillmentUserId, client);
      if (!lockedUser) {
        throw new Error(`Không tìm thấy tài khoản ${fulfillmentUserId} để đối soát thanh toán`);
      }
    }

    const claimed = await claimOrderSuccess(fresh.order_code, client);
    if (!claimed) {
      await client.query('COMMIT');
      return 'not_claimed';
    }

    const afterCommit = [];
    const einvoiceId = await fulfillPaidOrder(claimed, client, {
      registerAfterCommit: (callback) => afterCommit.push(callback),
    });
    await client.query('COMMIT');
    scheduleDispatchEinvoiceAfterCommit(einvoiceId);
    for (const callback of afterCommit) callback();
    console.log(`[PayOSReconcile] Fulfilled order ${claimed.order_code} via ${source}`);
    return 'fulfilled';
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[PayOSReconcile] claimAndFulfill failed for ${order.order_code}:`, err.message);
    return 'error';
  } finally {
    client.release();
  }
}

/**
 * Inspect one PayOS payment link and apply local order state.
 * @returns {'fulfilled'|'cancelled'|'amount_mismatch'|'skipped'|'not_found'|'error'}
 */
export async function applyPayosLinkToPendingOrder(order, { source = 'reconcile' } = {}) {
  if (!order || order.status !== 'pending') return 'skipped';

  let link;
  try {
    link = await payosClient.paymentRequests.get(String(order.order_code));
  } catch (err) {
    const msg = String(err?.message || err || '');
    // PayOS often says not found for never-created / purged links
    if (/không tồn tại|not found|404/i.test(msg)) {
      return 'not_found';
    }
    console.warn(`[PayOSReconcile] get(${order.order_code}) failed: ${msg}`);
    return 'error';
  }

  const status = String(link?.status || '').toUpperCase();

  if (status === 'PAID') {
    return claimAndFulfillFromPayos({
      order,
      amountPaid: link.amountPaid ?? link.amount,
      source,
    });
  }

  if (status === 'CANCELLED' || status === 'EXPIRED') {
    const cancelled = await cancelPendingOrderWithNote(
      order.order_code,
      `[OPS] PayOS ${status} via ${source} at ${new Date().toISOString()}`
    );
    return cancelled ? 'cancelled' : 'skipped';
  }

  // UNDERPAID / PROCESSING / PENDING / FAILED — leave pending
  return 'skipped';
}

/**
 * Cron: scan recent pending orders against PayOS.
 */
export async function reconcileRecentPendingOrders({
  withinHours = PAYOS_RECONCILE_WINDOW_HOURS,
} = {}) {
  const orders = await findPendingPayosOrdersSinceHours(withinHours);
  const summary = {
    scanned: orders.length,
    rescued: 0,
    cancelled: 0,
    amountMismatch: 0,
    skipped: 0,
    errors: 0,
    rescuedOrderCodes: [],
  };

  for (const order of orders) {
    const outcome = await applyPayosLinkToPendingOrder(order, { source: 'cron_reconcile' });
    if (outcome === 'fulfilled') {
      summary.rescued += 1;
      summary.rescuedOrderCodes.push(String(order.order_code));
    } else if (outcome === 'cancelled') {
      summary.cancelled += 1;
    } else if (outcome === 'amount_mismatch') {
      summary.amountMismatch += 1;
    } else if (outcome === 'error' || outcome === 'not_found') {
      // not_found during reconcile window: keep pending (may still be payable / race)
      summary.skipped += 1;
      if (outcome === 'error') summary.errors += 1;
    } else {
      summary.skipped += 1;
    }
  }

  summary.status = summary.rescued > 0 ? 'success' : 'noop';
  summary.synced = summary.rescued; // cron_job_runs recordRun noop heuristic
  return summary;
}

/**
 * Status endpoint: one PayOS check when local order is still pending.
 */
export async function tryFulfillPendingOrderOnStatusCheck(orderCode) {
  const order = await findOrderByCode(orderCode);
  if (!order) return null;
  if (order.status !== 'pending') return order;

  await applyPayosLinkToPendingOrder(order, { source: 'status_poll' });
  return findOrderByCode(orderCode);
}

/**
 * Cron: expire very old pending orders — always ask PayOS first.
 */
export async function expireStalePendingOrders({
  olderThanHours = PAYOS_EXPIRE_AFTER_HOURS,
} = {}) {
  const orders = await findStalePendingPayosOrders(olderThanHours);
  const summary = {
    scanned: orders.length,
    rescued: 0,
    cancelled: 0,
    skipped: 0,
    errors: 0,
  };

  for (const order of orders) {
    const outcome = await applyPayosLinkToPendingOrder(order, { source: 'cron_expire' });
    if (outcome === 'fulfilled') {
      summary.rescued += 1;
      continue;
    }
    if (outcome === 'cancelled') {
      summary.cancelled += 1;
      continue;
    }
    if (outcome === 'amount_mismatch') {
      summary.skipped += 1;
      continue;
    }
    if (outcome === 'error') {
      summary.errors += 1;
      // Do not cancel if PayOS is unreachable — retry next hour
      continue;
    }

    // not_found / skipped (still PENDING on PayOS etc.) → cancel locally as abandoned
    const cancelled = await cancelPendingOrderWithNote(
      order.order_code,
      `[OPS] Auto-cancelled pending > ${olderThanHours}h `
        + `(PayOS=${outcome}) at ${new Date().toISOString()}`
    );
    if (cancelled) summary.cancelled += 1;
    else summary.skipped += 1;
  }

  summary.status = summary.rescued > 0 || summary.cancelled > 0 ? 'success' : 'noop';
  summary.synced = summary.rescued + summary.cancelled;
  return summary;
}
