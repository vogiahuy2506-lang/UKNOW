import db from '../../config/database.js';
import payosClient from '../../utils/payos.util.js';
import { EFFECTIVE_PLAN_ID_SQL, resolveBillingUserId } from '../../utils/billingCycle.util.js';
import { getSubscriptionStatus } from '../../utils/subscriptionStatus.util.js';
import { getConfigValue } from '../../utils/customPlanPricing.util.js';
import {
  validateTopupQuantities,
  computeTopupPrice,
  checkTopupZaloCapacity,
  resolveMaxTopupMonths,
  filterAllowedTopupMonths,
  resolveTopupMonths,
  TOPUP_MIN_ORDER_AMOUNT,
  TOPUP_CONSUMABLE_KEYS,
} from '../../utils/topupPricing.util.js';
import {
  findAllTopupPricing,
  sumActiveTopupGrants,
  sumWalletGrants,
  insertTopupGrants,
} from '../../repositories/payment/topup.repository.js';
import { findAllPricingRows } from '../../repositories/payment/customPlan.repository.js';
import {
  createOrder,
  deleteOrderByCode,
  cancelRecentPendingTopupOrders,
} from '../../repositories/payment/payment.repository.js';
import { getPayosPendingWindowMinutes } from '../../repositories/voucher.repository.js';
import { bestEffortCancelPayosLinks } from '../../utils/payosLink.util.js';
import { resolveOrderAmountWithInvoice, normalizeBuyerInvoiceProfile } from '../../utils/invoiceVat.util.js';
import { saveInvoiceProfile } from '../../repositories/user/user.repository.js';
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
 * Năng lực giao tin theo slot được phép (gói + grant mua thêm tài khoản),
 * không bắt buộc đã quét QR kết nối. Slot gói (max_zalo_accounts) là trần thương mại;
 * grant mid-cycle cộng thêm vào trần đó trong chu kỳ hiện tại.
 */
function resolveAccountCount(planRow, connectedCount, accountGrants = 0) {
  const grants = Math.max(0, Number(accountGrants) || 0);
  const maxAccounts = planRow?.max_zalo_accounts;
  const planSlots = maxAccounts != null && Number.isFinite(Number(maxAccounts))
    ? Math.max(0, Number(maxAccounts))
    : null;

  if (planSlots != null) {
    return planSlots + grants;
  }

  // Gói không khai báo trần slot → lấy số đã nối (tối thiểu 1 nếu chưa nối) + grant.
  const connected = Math.max(0, Number(connectedCount) || 0);
  return Math.max(connected, 1) + grants;
}

async function buildZaloCapacityContext(billingUserId, requestedQty = 0) {
  const [planRow, connectedCount, existingGrants, accountGrants, customPricingRows] = await Promise.all([
    getBillingPlanZaloContext(billingUserId),
    countConnectedZaloAccounts(billingUserId),
    sumWalletGrants(billingUserId, 'zalo_messages'),
    sumActiveTopupGrants(billingUserId, 'zalo_accounts'),
    findAllPricingRows(),
  ]);

  const capacityPerAccount = getConfigValue(
    customPricingRows,
    'zalo_monthly_capacity_per_account',
    16000
  );
  const accounts = resolveAccountCount(planRow, connectedCount, accountGrants);
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

  const maxMonths = resolveMaxTopupMonths(subscription);
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
    maxMonths,
    allowedMonths: filterAllowedTopupMonths(maxMonths),
    zaloCapacity,
    billingUserId,
  };
}

/**
 * Server-side quote — always recomputes price.
 */
export async function quoteTopup({ userId, ownerContextId, quantities = {}, months: rawMonths } = {}) {
  if (!userId) throw { status: 401, message: 'Yêu cầu đăng nhập' };

  const billingOptions = ownerContextId != null ? { ownerContextId } : {};
  const subscription = await assertSubscriptionAllowsTopup(userId, billingOptions);
  const billingUserId = await resolveBillingUserId(userId, billingOptions);

  const pricingRows = await findAllTopupPricing();
  const validation = validateTopupQuantities(pricingRows, quantities);
  if (!validation.ok) {
    throw { status: 400, message: validation.errors.join('; '), errors: validation.errors };
  }

  const monthsResolved = resolveTopupMonths({
    rawMonths,
    quantities: validation.quantities,
    subscription,
  });
  if (!monthsResolved.ok) {
    throw {
      status: monthsResolved.status,
      message: monthsResolved.message,
      code: monthsResolved.code,
      maxMonths: monthsResolved.maxMonths,
      allowedMonths: monthsResolved.allowedMonths,
    };
  }

  const priced = computeTopupPrice(pricingRows, validation.quantities, monthsResolved.months);
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
    months: monthsResolved.months,
    maxMonths: monthsResolved.maxMonths,
    allowedMonths: monthsResolved.allowedMonths,
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
  months: rawMonths,
  invoiceInfo: invoiceInfoRaw = null,
} = {}) {
  if (!userId || !userEmail) throw { status: 401, message: 'Yêu cầu đăng nhập' };

  const quote = await quoteTopup({ userId, ownerContextId, quantities, months: rawMonths });
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

  const net = Math.round(quote.total);
  const priced = resolveOrderAmountWithInvoice(invoiceInfoRaw, net, {
    accountEmail: userEmail,
  });
  const amount = priced.amount;
  const invoiceInfo = priced.invoiceInfo;
  const orderCode = generateOrderCode();
  const pendingWindowMinutes = await getPayosPendingWindowMinutes();
  const reuseWindowMinutes = Math.max(1, Number(pendingWindowMinutes) - 2);
  const topupConfig = {
    quantities: quote.quantities,
    billingUserId: quote.billingUserId,
    items: quote.items,
    total: net,
    months: quote.months,
  };

  const cancelledDupes = await cancelRecentPendingTopupOrders({
    userId,
    withinMinutes: reuseWindowMinutes,
  });
  if (cancelledDupes.length) {
    await bestEffortCancelPayosLinks(cancelledDupes.map((r) => r.order_code));
  }

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
      originalAmount: net,
      discountAmount: 0,
      status: 'pending',
      paymentMethod: 'payos',
      note: 'topup',
      topupConfig,
      invoiceInfo,
    }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (userId && invoiceInfoRaw?.saveProfile === true) {
    try {
      const normalizedProfile = normalizeBuyerInvoiceProfile(invoiceInfoRaw);
      await saveInvoiceProfile(userId, normalizedProfile);
    } catch (err) {
      console.warn('[TopupService] Failed to auto-save invoice profile:', err.message);
    }
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

  const consumableQty = {};
  const structuralQty = {};
  for (const [key, qty] of Object.entries(quantities)) {
    if (!(Number(qty) > 0)) continue;
    if (TOPUP_CONSUMABLE_KEYS.includes(key)) consumableQty[key] = Number(qty);
    else structuralQty[key] = Number(qty);
  }

  const inserted = [];

  // Consumable wallet: cycle_end NULL — không cần subscription_expires_at
  if (Object.keys(consumableQty).length > 0) {
    const rows = await insertTopupGrants({
      userId: billingUserId,
      orderId: order.id,
      cycleEnd: null,
      quantities: consumableQty,
    }, queryable);
    inserted.push(...rows);
  }

  // Structural: mốc hết hạn độc lập — NOW() + 30×months days (không neo subscription_expires_at)
  if (Object.keys(structuralQty).length > 0) {
    const rawMonths = config.months == null || config.months === '' ? 1 : Number(config.months);
    const months = Number.isInteger(rawMonths) && rawMonths > 0 ? rawMonths : 1;
    const { rows } = await queryable.query(
      `SELECT NOW() + ($1 * INTERVAL '30 days') AS cycle_end`,
      [months]
    );
    const cycleEnd = rows[0]?.cycle_end;
    const rowsInserted = await insertTopupGrants({
      userId: billingUserId,
      orderId: order.id,
      cycleEnd,
      quantities: structuralQty,
    }, queryable);
    inserted.push(...rowsInserted);
  }

  // Mở/khoá tài nguyên theo trần hiệu dụng ngay trong cùng transaction
  const { reconcileResourceLocks } = await import('./topupLock.service.js');
  await reconcileResourceLocks(billingUserId, queryable, { unlockOnly: true });

  _clearQuotaCache();
  return inserted;
}

export { ownerContextFromReqUser, TOPUP_MIN_ORDER_AMOUNT };
