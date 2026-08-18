import crypto from 'crypto';
import { findPlanByCode, getPlanByUserId } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import db from '../../config/database.js';
import { resolveCheckoutDiscount } from '../voucher.service.js';
import { toValidatedCodeDto } from '../../utils/voucherOffer.util.js';
import {
    createOrder,
    findOrderStatusByCode,
    findOrderByCode,
    claimOrderSuccess,
    markOrderFailedForReview,
    activateUserPlan,
    hasSuccessfulOrderForPlanByUser,
    deleteOrderByCode,
    cancelRecentPendingPlanOrders,
} from '../../repositories/payment/payment.repository.js';
import {
    redeemVoucherForOrder,
    getPayosPendingWindowMinutes,
} from '../../repositories/voucher.repository.js';
import { createPlan } from '../../repositories/admin/adminPlans.repository.js';
import {
    findCustomPlanOwnedByUser,
    updateCustomPlanLimits,
} from '../../repositories/payment/customPlan.repository.js';
import { resolveCustomPlanQuote } from './customPlan.service.js';
import { CUSTOM_PLAN_VOUCHER_CODE } from '../../utils/customPlanPricing.util.js';
import { fulfillPaidOrder } from './payosOrderFulfillment.service.js';
import {
    tryFulfillPendingOrderOnStatusCheck,
} from './payosReconcile.service.js';
import { bestEffortCancelPayosLinks } from '../../utils/payosLink.util.js';
import { resolveOrderAmountWithInvoice, normalizeBuyerInvoiceProfile } from '../../utils/invoiceVat.util.js';
import { saveInvoiceProfile } from '../../repositories/user/user.repository.js';
import { scheduleDispatchEinvoiceAfterCommit } from './matbaoInvoice.service.js';

const isTrialOrFreePlan = (plan) => {
    if (!plan) return false;
    const trialCode = process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial';
    return plan.code === trialCode || Number(plan.price) === 0;
};

const assertTrialNotRegisteredTwice = async ({ plan, userId, userEmail }) => {
    // Rule: Mọi gói dùng thử / miễn phí chỉ được đăng ký 1 lần / tài khoản.
    if (!isTrialOrFreePlan(plan)) return;

    const alreadyRegistered = await hasSuccessfulOrderForPlanByUser({
        planId: plan.id,
        userId,
        userEmail,
    });
    if (alreadyRegistered) {
        throw { status: 409, message: 'Gói dùng thử chỉ được đăng ký một lần cho mỗi tài khoản' };
    }
};

const assertNoImmediateDowngrade = async ({ targetPlan, userId }) => {
    if (!userId) return;
    const currentPlan = await getPlanByUserId(userId);
    if (!currentPlan) return;
    if (Number(currentPlan.id) === Number(targetPlan.id)) return;

    const currentMonthlyPrice = Number(currentPlan.price || 0);
    const targetMonthlyPrice = Number(targetPlan.price || 0);
    if (targetMonthlyPrice < currentMonthlyPrice) {
        throw {
            status: 409,
            message: 'Không thể hạ gói ngay khi còn hiệu lực gói hiện tại. Vui lòng hạ gói vào kỳ tiếp theo.',
        };
    }
};

/**
 * PayOS orderCode: positive integer ≤ 9007199254740991.
 * Keep millisecond-based form close to the previous Date.now() shape to avoid
 * sandbox/production surprises; *100 + 0..99 only reduces same-ms collision.
 * MUST create a sandbox payment link before production deploy when changing this.
 */
const generateOrderCode = () => Date.now() * 100 + crypto.randomInt(0, 100);

export const createPaymentLink = async ({
    planCode,
    userEmail,
    userId = null,
    billingPeriod = 'monthly',
    voucherCode = null,
    explicitVoucherCode = null,
    invoiceInfo: invoiceInfoRaw = null,
}) => {
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');
    await assertTrialNotRegisteredTwice({ plan, userId, userEmail });
    await assertNoImmediateDowngrade({ targetPlan: plan, userId });

    const originalAmount = billingPeriod === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly)
        : Number(plan.price);

    if (originalAmount <= 0) throw new Error('Giá tiền không hợp lệ cho gói này');

    const pendingWindowMinutes = getPayosPendingWindowMinutes();
    const reuseWindowMinutes = Math.max(1, pendingWindowMinutes - 2);
    const orderCode = generateOrderCode();

    const cancelledDupes = await cancelRecentPendingPlanOrders({
        userId,
        userEmail,
        planId: plan.id,
        billingPeriod,
        withinMinutes: reuseWindowMinutes,
    });
    if (cancelledDupes.length) {
        await bestEffortCancelPayosLinks(cancelledDupes.map((r) => r.order_code));
    }

    const client = await db.getClient();
    let order;
    let voucher = null;
    let amount = Math.round(originalAmount);
    let discountAmount = 0;
    let discount = null;

    try {
        await client.query('BEGIN');

        const resolved = await resolveCheckoutDiscount({
            userId,
            userEmail,
            planCode,
            billingPeriod,
            originalAmount,
            explicitCode: explicitVoucherCode,
            voucherCodeAlias: String(explicitVoucherCode || '').trim() ? null : voucherCode,
            allowAutomatic: true,
            lockForPayment: true,
            queryable: client,
            pendingWindowMinutes,
        });
        voucher = resolved.voucher;
        discountAmount = Number(resolved.discountAmount || 0);
        amount = Number(resolved.finalAmount || 0);
        discount = resolved.discount;

        const priced = resolveOrderAmountWithInvoice(invoiceInfoRaw, amount, {
            accountEmail: userEmail,
        });
        amount = priced.amount;
        const invoiceInfo = priced.invoiceInfo;

        order = await createOrder({
            orderCode,
            planId: plan.id,
            amount,
            userEmail,
            userId,
            billingPeriod,
            originalAmount,
            discountAmount,
            voucherId: resolved.snapshot.voucherId,
            voucherCode: resolved.snapshot.voucherCode,
            discountSource: resolved.snapshot.discountSource,
            discountLabel: resolved.snapshot.discountLabel,
            status: amount <= 0 ? 'success' : 'pending',
            paymentMethod: amount <= 0 ? 'voucher' : 'payos',
            invoiceInfo,
        }, client);

        if (amount <= 0) {
            await redeemVoucherForOrder(order, client);
            if (userId) {
                await activateUserPlan(userId, plan.id, billingPeriod, client);
                const { reconcileResourceLocks } = await import('./topupLock.service.js');
                await reconcileResourceLocks(userId, client, { unlockOnly: true });
            }
        }

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
            console.warn('[PaymentService] Failed to auto-save invoice profile:', err.message);
        }
    }

    if (amount <= 0) {
        return {
            orderCode,
            originalAmount: Math.round(originalAmount),
            discountAmount,
            amount,
            voucher: voucher ? toValidatedCodeDto(voucher) : null,
            discount,
            noPayment: true,
        };
    }

    const expiredAt = Math.floor(Date.now() / 1000) + pendingWindowMinutes * 60;

    try {
        const paymentLink = await payosClient.paymentRequests.create({
            orderCode: Number(orderCode),
            amount,
            description: `TT ${planCode}`.substring(0, 25),
            returnUrl: `${process.env.FRONTEND_URL}/payment-success`,
            cancelUrl: `${process.env.FRONTEND_URL}/checkout`,
            expiredAt,
        });

        console.log('PayOS response:', JSON.stringify(paymentLink, null, 2));

        return {
            qrCode: paymentLink.qrCode,
            checkoutUrl: paymentLink.checkoutUrl,
            orderCode,
            originalAmount: Math.round(originalAmount),
            discountAmount,
            amount,
            voucher: voucher ? toValidatedCodeDto(voucher) : null,
            discount,
            expiredAt,
        };
    } catch (err) {
        try { await deleteOrderByCode(orderCode); } catch { /* best-effort */ }
        const message = String(err?.message || err?.desc || '').trim();
        throw {
            status: 502,
            message: message ? `PayOS: ${message}` : 'Không thể tạo link thanh toán PayOS',
        };
    }
};

export const handleWebhook = async (body) => {
    const webhookData = await payosClient.webhooks.verify(body);

    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

    if (webhookData.code === '00') {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const existing = await findOrderByCode(webhookData.orderCode, client);
            if (!existing) {
                await client.query('COMMIT');
                console.warn(`[Webhook] Không tìm thấy đơn ${webhookData.orderCode}`);
                return webhookData;
            }

            if (['success', 'cancelled', 'failed'].includes(existing.status)) {
                await client.query('COMMIT');
                console.log(`[Webhook] Đơn ${webhookData.orderCode} đã ${existing.status} — bỏ qua`);
                return webhookData;
            }

            // Permanent anomaly: ack (HTTP 200) to stop PayOS retries; do not activate plan.
            if (
                webhookData.amount != null &&
                Number(webhookData.amount) !== Number(existing.amount)
            ) {
                const note =
                    `[OPS] AMOUNT_MISMATCH expected=${existing.amount} got=${webhookData.amount} at ${new Date().toISOString()}`;
                await markOrderFailedForReview(webhookData.orderCode, note, client);
                await client.query('COMMIT');
                console.error(
                    `[Webhook][OPS ALERT] Amount mismatch — order ${webhookData.orderCode} marked failed for manual review. ${note}`
                );
                return { ...webhookData, amountMismatch: true, acknowledged: true };
            }

            const order = await claimOrderSuccess(webhookData.orderCode, client);
            if (!order) {
                await client.query('COMMIT');
                console.log(`[Webhook] Đơn ${webhookData.orderCode} không claim được — bỏ qua`);
                return webhookData;
            }

            const einvoiceId = await fulfillPaidOrder(order, client);
            await client.query('COMMIT');
            scheduleDispatchEinvoiceAfterCommit(einvoiceId);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    return webhookData;
};

export const activateFreePlan = async ({ planCode, userId, userEmail, billingPeriod = 'monthly' }) => {
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');
    await assertTrialNotRegisteredTwice({ plan, userId, userEmail });
    await assertNoImmediateDowngrade({ targetPlan: plan, userId });

    const amount = billingPeriod === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly)
        : Number(plan.price);

    if (amount > 0) throw new Error('Gói này cần thanh toán, không thể kích hoạt miễn phí');

    const orderCode = generateOrderCode();

    await createOrder({
        orderCode,
        planId: plan.id,
        amount: 0,
        userEmail,
        userId,
        status: 'success',
        paymentMethod: 'free',
        billingPeriod,
    });

    if (userId) {
        await activateUserPlan(userId, plan.id, billingPeriod);
        const { reconcileResourceLocks } = await import('./topupLock.service.js');
        await reconcileResourceLocks(userId, undefined, { unlockOnly: true });
    }

    return { orderCode };
};

export const getOrderStatus = async (orderCode) => {
    const current = await findOrderStatusByCode(orderCode);
    if (!current) return null;
    if (current.status !== 'pending') return current;

    const refreshed = await tryFulfillPendingOrderOnStatusCheck(orderCode);
    if (!refreshed) return current;
    return {
        status: refreshed.status,
        user_id: refreshed.user_id,
        user_email: refreshed.user_email,
    };
};

const configsEqual = (a, b) => {
    try {
        return JSON.stringify(a || {}) === JSON.stringify(b || {});
    } catch {
        return false;
    }
};

const buildCustomPlanName = (email) => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const shortEmail = String(email || 'user').split('@')[0].slice(0, 20);
    return `Gói tự chọn — ${shortEmail} — ${ym}`.slice(0, 100);
};

/**
 * Self-serve custom plan checkout.
 * Client sends quantities only — price is always recomputed server-side.
 */
export const createCustomPaymentLink = async ({
    quantities,
    userEmail,
    userId,
    billingPeriod = 'monthly',
    voucherCode = null,
    explicitVoucherCode = null,
    reusePlanId = null,
    invoiceInfo: invoiceInfoRaw = null,
}) => {
    if (!userId || !userEmail) {
        throw { status: 401, message: 'Yêu cầu đăng nhập' };
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
        throw { status: 400, message: 'billingPeriod phải là monthly hoặc yearly' };
    }

    const quote = await resolveCustomPlanQuote({ quantities, billingPeriod });
    const originalAmount = Math.round(Number(quote.total));
    if (originalAmount <= 0) {
        throw { status: 400, message: 'Giá gói tự chọn không hợp lệ' };
    }

    // Virtual plan object for downgrade check (compare monthly price)
    const virtualPlan = {
        id: reusePlanId || null,
        price: quote.monthlyTotal,
        price_yearly: quote.yearlyTotal,
        duration_days: 30,
    };
    await assertNoImmediateDowngrade({ targetPlan: virtualPlan, userId });

    const planColumns = quote.planColumns;
    const customConfig = {
        quantities: quote.quantities,
        billingPeriod,
        monthlyTotal: quote.monthlyTotal,
        yearlyTotal: quote.yearlyTotal,
    };

    const pendingWindowMinutes = getPayosPendingWindowMinutes();
    const reuseWindowMinutes = Math.max(1, pendingWindowMinutes - 2);
    const orderCode = generateOrderCode();

    const client = await db.getClient();
    let plan = null;
    let createdNewPlan = false;
    let order;
    let voucher = null;
    let amount = originalAmount;
    let discountAmount = 0;
    let discount = null;

    try {
        await client.query('BEGIN');

        if (reusePlanId) {
            plan = await findCustomPlanOwnedByUser(reusePlanId, userId, client);
            if (!plan) {
                throw { status: 403, message: 'Không thể tái sử dụng gói này' };
            }
            const existingConfig = plan.custom_config || {};
            const existingQty = existingConfig.quantities || existingConfig;
            if (!configsEqual(existingQty, quote.quantities)) {
                // Config changed — update limits on owned plan rather than creating a new row
                plan = await updateCustomPlanLimits(plan.id, {
                    name: plan.name,
                    price: quote.monthlyTotal,
                    priceYearly: quote.yearlyTotal,
                    customConfig,
                    ...planColumns,
                    durationDays: 30,
                }, client);
            } else {
                // Same config (renewal) — refresh prices
                plan = await updateCustomPlanLimits(plan.id, {
                    name: plan.name,
                    price: quote.monthlyTotal,
                    priceYearly: quote.yearlyTotal,
                    customConfig,
                    ...planColumns,
                    durationDays: 30,
                }, client);
            }
        } else {
            plan = await createPlan({
                code: null,
                name: buildCustomPlanName(userEmail),
                price: quote.monthlyTotal,
                priceYearly: quote.yearlyTotal,
                description: 'Gói tự chọn (self-serve)',
                features: [],
                maxEmployees: planColumns.maxEmployees ?? 1,
                isActive: true,
                isCustom: true,
                durationDays: 30,
                dailyEmailLimit: planColumns.dailyEmailLimit,
                monthlyEmailLimit: planColumns.monthlyEmailLimit,
                dailyZaloLimit: planColumns.dailyZaloLimit,
                monthlyZaloLimit: planColumns.monthlyZaloLimit,
                messagesPerPeriod: null,
                isFupEnabled: false,
                maxLandingPages: planColumns.maxLandingPages,
                maxCampaigns: planColumns.maxCampaigns,
                maxZaloCampaigns: planColumns.maxZaloCampaigns,
                maxZaloGroupCampaigns: planColumns.maxZaloGroupCampaigns,
                maxEmailCampaigns: planColumns.maxEmailCampaigns,
                maxZaloAccounts: planColumns.maxZaloAccounts,
                maxEmailAccounts: planColumns.maxEmailAccounts,
                maxEmailTemplates: planColumns.maxEmailTemplates,
                maxZaloTemplates: planColumns.maxZaloTemplates,
                maxChatbots: planColumns.maxChatbots,
                aiTokensPerPeriod: null,
                aiCreditsPerPeriod: planColumns.aiCreditsPerPeriod,
                storageLimitBytes: planColumns.storageLimitBytes,
                maxKbDocuments: planColumns.maxKbDocuments,
                maxKbExtractedChars: planColumns.maxKbExtractedChars,
                gracePeriodDays: 0,
                customOwnerUserId: userId,
                customConfig,
            }, client);
            createdNewPlan = true;
        }

        const cancelledDupes = await cancelRecentPendingPlanOrders({
            userId,
            userEmail,
            planId: plan.id,
            billingPeriod,
            withinMinutes: reuseWindowMinutes,
            queryable: client,
        });
        if (cancelledDupes.length) {
            // PayOS cancel outside txn best-effort after commit — fire now is fine too
            bestEffortCancelPayosLinks(cancelledDupes.map((r) => r.order_code)).catch(() => {});
        }

        const resolved = await resolveCheckoutDiscount({
            userId,
            userEmail,
            planCode: CUSTOM_PLAN_VOUCHER_CODE,
            billingPeriod,
            originalAmount,
            explicitCode: explicitVoucherCode,
            voucherCodeAlias: String(explicitVoucherCode || '').trim() ? null : voucherCode,
            allowAutomatic: false,
            lockForPayment: true,
            queryable: client,
            pendingWindowMinutes,
        });
        voucher = resolved.voucher;
        discountAmount = Number(resolved.discountAmount || 0);
        amount = Number(resolved.finalAmount || 0);
        discount = resolved.discount;

        const priced = resolveOrderAmountWithInvoice(invoiceInfoRaw, amount, {
            accountEmail: userEmail,
        });
        amount = priced.amount;
        const invoiceInfo = priced.invoiceInfo;

        order = await createOrder({
            orderCode,
            planId: plan.id,
            amount,
            userEmail,
            userId,
            billingPeriod,
            originalAmount,
            discountAmount,
            voucherId: resolved.snapshot.voucherId,
            voucherCode: resolved.snapshot.voucherCode,
            discountSource: resolved.snapshot.discountSource,
            discountLabel: resolved.snapshot.discountLabel,
            status: amount <= 0 ? 'success' : 'pending',
            paymentMethod: amount <= 0 ? 'voucher' : 'payos',
            note: 'custom_self_serve',
            invoiceInfo,
        }, client);

        if (amount <= 0) {
            await redeemVoucherForOrder(order, client);
            await activateUserPlan(userId, plan.id, billingPeriod, client);
            const { reconcileResourceLocks } = await import('./topupLock.service.js');
            await reconcileResourceLocks(userId, client, { unlockOnly: true });
        }

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
            console.warn('[PaymentService] Failed to auto-save invoice profile:', err.message);
        }
    }

    if (amount <= 0) {
        return {
            orderCode,
            planId: plan.id,
            originalAmount,
            discountAmount,
            amount,
            voucher: voucher ? toValidatedCodeDto(voucher) : null,
            discount,
            quote,
            noPayment: true,
        };
    }

    const expiredAt = Math.floor(Date.now() / 1000) + pendingWindowMinutes * 60;

    try {
        const paymentLink = await payosClient.paymentRequests.create({
            orderCode: Number(orderCode),
            amount,
            description: `TT custom`.substring(0, 25),
            returnUrl: `${process.env.FRONTEND_URL}/payment-success`,
            cancelUrl: `${process.env.FRONTEND_URL}/checkout`,
            expiredAt,
        });

        return {
            qrCode: paymentLink.qrCode,
            checkoutUrl: paymentLink.checkoutUrl,
            orderCode,
            planId: plan.id,
            originalAmount,
            discountAmount,
            amount,
            voucher: voucher ? toValidatedCodeDto(voucher) : null,
            discount,
            quote,
            expiredAt,
        };
    } catch (err) {
        try { await deleteOrderByCode(orderCode); } catch { /* best-effort */ }
        if (createdNewPlan && plan?.id) {
            try {
                const { deletePlan } = await import('../../repositories/admin/adminPlans.repository.js');
                await deletePlan(plan.id);
            } catch { /* best-effort */ }
        }
        if (err?.status) throw err;
        const message = String(err?.message || err?.desc || '').trim();
        throw {
            status: 502,
            message: message ? `PayOS: ${message}` : 'Không thể tạo link thanh toán PayOS',
        };
    }
};
