import db from '../../config/database.js';
import payosClient from '../../utils/payos.util.js';
import { EFFECTIVE_PLAN_ID_SQL, resolveBillingUserId } from '../../utils/billingCycle.util.js';
import { getSubscriptionStatus } from '../../utils/subscriptionStatus.util.js';
import { getConfigValue } from '../../utils/customPlanPricing.util.js';
import {
  validateTopupQuantities,
  computeTopupPrice,
  checkTopupZaloCapacity,
  TOPUP_MIN_ORDER_AMOUNT,
} from '../../utils/topupPricing.util.js';
import {
  findAllTopupPricing,
  sumActiveTopupGrants,
  insertTopupGrants,
} from '../../repositories/payment/topup.repository.js';
import { findAllPricingRows } from '../../repositories/payment/customPlan.repository.js';
import {
  createOrder,
  deleteOrderByCode,
} from '../../repositories/payment/payment.repository.js';
import { getPayosPendingWindowMinutes } from '../../repositories/voucher.repository.js';
import { _clearQuotaCache } from '../../utils/userSendLimit.util.js';
import crypto from 'crypto';

const generateOrderCode = () => Date.now() * 100 + crypto.randomInt(0, 100);

function ownerContextFromReqUser(user) {
  if (user?.activeContext?.type === 'employee' && user.activeContext.ownerId != null) {
    return { ownerContextId: user.activeContext.ownerId };
  }
  return {};
}

/**
 * Load plan monthly_zalo_limit + max_zalo_accounts for billing owner.
 */
async function getBillingPlanZaloContext(billingUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT p.monthly_zalo_limit, p.max_zalo_accounts,
            u.subscription_expires_at
     FROM users u
     LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  return rows[0] || null;
}

async function countConnectedZaloAccounts(billingUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total
     FROM zalo_settings
     WHERE id_user = $1 AND status = 'connected' AND is_active = TRUE`,
    [billingUserId]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * Năng lực giao tin = số tài khoản Zalo đã kết nối thật.
 * Slot gói (max_zalo_accounts) chỉ là trần được phép nối — không phải năng lực giao hàng.
 * Nếu gói có trần slot, lấy min(đã nối, slot) để không vượt trần thương mại.
 */
function resolveAccountCount(planRow, connectedCount) {
  const connected = Math.max(0, Number(connectedCount) || 0);
  const maxAccounts = planRow?.max_zalo_accounts;
  if (maxAccounts != null && Number.isFinite(Number(maxAccounts))) {
    return Math.min(connected, Math.max(0, Number(maxAccounts)));
  }
  return connected;
}

async function buildZaloCapacityContext(billingUserId, requestedQty = 0) {
  const [planRow, connectedCount, existingGrants, customPricingRows] = await Promise.all([
    getBillingPlanZaloContext(billingUserId),
    countConnectedZaloAccounts(billingUserId),
    sumActiveTopupGrants(billingUserId, 'zalo_messages'),
    findAllPricingRows(),
  ]);

  const capacityPerAccount = getConfigValue(
    customPricingRows,
    'zalo_monthly_capacity_per_account',
    16000
  );
  const accounts = resolveAccountCount(planRow, connectedCount);
  const planMonthlyZaloLimit = planRow?.monthly_zalo_limit == null
    ? null
    : Number(planRow.monthly_zalo_limit);

  return checkTopupZaloCapacity({
    accounts,
    capacityPerAccount,
    planMonthlyZaloLimit,
    existingZaloGrants: existingGrants,
    requestedQty,
  });
}

async function assertSubscriptionAllowsTopup(userId, billingOptions = {}) {
  const subscription = await getSubscriptionStatus(userId, billingOptions);
  if (!subscription.hasPlan) {
    throw { status: 400, message: 'Bạn cần có gói dịch vụ đang hiệu lực để mua thêm hạn mức.' };
  }
  if (subscription.isExpired) {
    throw {
      status: 400,
      message: 'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn trước khi mua thêm.',
    };
  }
  if (!subscription.expiresAt) {
    throw { status: 400, message: 'Không xác định được chu kỳ thuê bao để cấp hạn mức.' };
  }
  return subscription;
}

/**
 * GET config + current Zalo remaining capacity for UI.
 */
export async function getTopupConfig({ userId, ownerContextId } = {}) {
  const billingOptions = ownerContextId != null ? { ownerContextId } : {};
  const billingUserId = await resolveBillingUserId(userId, billingOptions);
  const pricingRows = await findAllTopupPricing();
  const subscription = await getSubscriptionStatus(userId, billingOptions);
  const zaloCapacity = await buildZaloCapacityContext(billingUserId, 0);

  return {
    minOrderAmount: TOPUP_MIN_ORDER_AMOUNT,
    items: pricingRows.map((r) => ({
      itemKey: r.item_key,
      unitPrice: Number(r.unit_price),
      minQty: Number(r.min_qty),
      stepQty: Number(r.step_qty),
      maxQty: r.max_qty == null ? null : Number(r.max_qty),
      sortOrder: Number(r.sort_order),
    })),
    subscription: {
      hasPlan: subscription.hasPlan,
      isExpired: subscription.isExpired,
      isInGracePeriod: subscription.isInGracePeriod,
      expiresAt: subscription.expiresAt,
    },
    zaloCapacity,
    billingUserId,
  };
}

/**
 * Server-side quote — always recomputes price.
 */
export async function quoteTopup({ userId, ownerContextId, quantities = {} } = {}) {
  if (!userId) throw { status: 401, message: 'Yêu cầu đăng nhập' };

  const billingOptions = ownerContextId != null ? { ownerContextId } : {};
  await assertSubscriptionAllowsTopup(userId, billingOptions);
  const billingUserId = await resolveBillingUserId(userId, billingOptions);

  const pricingRows = await findAllTopupPricing();
  const validation = validateTopupQuantities(pricingRows, quantities);
  if (!validation.ok) {
    throw { status: 400, message: validation.errors.join('; '), errors: validation.errors };
  }

  const priced = computeTopupPrice(pricingRows, validation.quantities);
  const zaloCapacity = await buildZaloCapacityContext(
    billingUserId,
    validation.quantities.zalo_messages || 0
  );

  if ((validation.quantities.zalo_messages || 0) > 0 && !zaloCapacity.ok) {
    throw {
      status: 400,
      message: zaloCapacity.message,
      code: zaloCapacity.code || 'ZALO_CAPACITY_EXCEEDED',
      capacity: zaloCapacity,
    };
  }

  // Cap zalo maxQty dynamically for UI when quoting
  const items = priced.items.map((item) => {
    if (item.itemKey !== 'zalo_messages') return item;
    const dynamicMax = zaloCapacity.remaining + (validation.quantities.zalo_messages || 0);
    return {
      ...item,
      maxQty: item.maxQty == null
        ? dynamicMax
        : Math.min(Number(item.maxQty), dynamicMax),
    };
  });

  return {
    quantities: validation.quantities,
    items,
    total: priced.total,
    meetsMinimum: priced.meetsMinimum,
    shortfall: priced.shortfall,
    minOrderAmount: priced.minOrderAmount,
    zaloCapacity,
    billingUserId,
  };
}

/**
 * Create PayOS payment for top-up. No vouchers. plan_id NULL, note='topup'.
 */
export async function createTopupPaymentLink({
  userId,
  userEmail,
  ownerContextId,
  quantities = {},
} = {}) {
  if (!userId || !userEmail) throw { status: 401, message: 'Yêu cầu đăng nhập' };

  const quote = await quoteTopup({ userId, ownerContextId, quantities });
  if (!quote.items.length) {
    throw { status: 400, message: 'Chọn ít nhất một hạng mục để mua thêm' };
  }
  if (!quote.meetsMinimum) {
    throw {
      status: 400,
      message: `Đơn tối thiểu ${TOPUP_MIN_ORDER_AMOUNT.toLocaleString('vi-VN')}đ (còn thiếu ${quote.shortfall.toLocaleString('vi-VN')}đ)`,
      shortfall: quote.shortfall,
      minOrderAmount: TOPUP_MIN_ORDER_AMOUNT,
    };
  }

  const amount = Math.round(quote.total);
  const orderCode = generateOrderCode();
  const pendingWindowMinutes = await getPayosPendingWindowMinutes();
  const topupConfig = {
    quantities: quote.quantities,
    billingUserId: quote.billingUserId,
    items: quote.items,
    total: amount,
  };

  const client = await db.getClient();
  let order;
  try {
    await client.query('BEGIN');
    order = await createOrder({
      orderCode,
      planId: null,
      amount,
      userEmail,
      userId,
      billingPeriod: 'monthly',
      originalAmount: amount,
      discountAmount: 0,
      status: 'pending',
      paymentMethod: 'payos',
      note: 'topup',
      topupConfig,
    }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const expiredAt = Math.floor(Date.now() / 1000) + pendingWindowMinutes * 60;

  try {
    const paymentLink = await payosClient.paymentRequests.create({
      orderCode: Number(orderCode),
      amount,
      description: 'Mua them han muc'.substring(0, 25),
      returnUrl: `${process.env.FRONTEND_URL || 'https://founderai.vn'}/payment-success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'https://founderai.vn'}/app/topup`,
      expiredAt,
    });

    return {
      qrCode: paymentLink.qrCode,
      checkoutUrl: paymentLink.checkoutUrl,
      orderCode,
      amount,
      originalAmount: amount,
      discountAmount: 0,
      expiredAt,
      topupConfig,
    };
  } catch (err) {
    await deleteOrderByCode(orderCode).catch(() => {});
    throw err;
  }
}

/**
 * Apply top-up grants after successful claim. Call inside webhook transaction.
 * Does NOT activate plan.
 */
export async function fulfillTopupOrder(order, queryable = db) {
  const config = typeof order.topup_config === 'string'
    ? JSON.parse(order.topup_config)
    : (order.topup_config || {});

  const quantities = config.quantities || {};
  const billingUserId = config.billingUserId || order.user_id;
  if (!billingUserId) {
    throw new Error(`Top-up order ${order.id || order.order_code}: missing billingUserId`);
  }

  const { rows } = await queryable.query(
    `SELECT subscription_expires_at FROM users WHERE id = $1 LIMIT 1`,
    [billingUserId]
  );
  const cycleEnd = rows[0]?.subscription_expires_at;
  if (!cycleEnd) {
    // Đơn đã claim success trong cùng transaction — đừng ném lỗi (rollback → PayOS
    // retry vô hạn mà vẫn không cấp được). Log OPS để cấp tay.
    console.error(
      `[Webhook][OPS ALERT] Top-up order ${order.order_code || order.id} ` +
      `claimed but user ${billingUserId} has no subscription_expires_at — ` +
      `grants NOT written. Manual grant needed. quantities=${JSON.stringify(quantities)}`
    );
    return [];
  }

  const inserted = await insertTopupGrants({
    userId: billingUserId,
    orderId: order.id,
    cycleEnd,
    quantities,
  }, queryable);

  _clearQuotaCache();
  return inserted;
}

export { ownerContextFromReqUser, TOPUP_MIN_ORDER_AMOUNT };
