import crypto from 'crypto';
import { findPlanByCode, getPlanByUserId, findPlanById } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import db from '../../config/database.js';
import { validateVoucherForCheckout } from '../voucher.service.js';
import { sendSystemEmail, buildPaymentSuccessEmail } from '../../utils/systemEmail.util.js';
import {
    createOrder,
    findOrderStatusByCode,
    findOrderByCode,
    claimOrderSuccess,
    markOrderFailedForReview,
    findUserIdByEmail,
    activateUserPlan,
    hasSuccessfulOrderForPlanByUser,
} from '../../repositories/payment/payment.repository.js';
import {
    redeemVoucherForOrder,
    getPayosPendingWindowMinutes,
} from '../../repositories/voucher.repository.js';
import { findActiveUserByEmail } from '../../repositories/user/user.repository.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

const assertTrialNotRegisteredTwice = async ({ plan, userId, userEmail }) => {
    // Rule: trial plan (10 ngày) chỉ được đăng ký 1 lần / tài khoản.
    if (Number(plan?.duration_days) !== 10) return;

    const alreadyRegistered = await hasSuccessfulOrderForPlanByUser({
        planId: plan.id,
        userId,
        userEmail,
    });
    if (alreadyRegistered) {
        throw { status: 409, message: 'Gói dùng thử 10 ngày chỉ được đăng ký một lần cho mỗi tài khoản' };
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

export const createPaymentLink = async ({ planCode, userEmail, userId = null, billingPeriod = 'monthly', voucherCode = null }) => {
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');
    await assertTrialNotRegisteredTwice({ plan, userId, userEmail });
    await assertNoImmediateDowngrade({ targetPlan: plan, userId });

    const originalAmount = billingPeriod === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly)
        : Number(plan.price);

    if (originalAmount <= 0) throw new Error('Giá tiền không hợp lệ cho gói này');

    const hasVoucher = Boolean(String(voucherCode || '').trim());
    const pendingWindowMinutes = getPayosPendingWindowMinutes();
    const orderCode = generateOrderCode();

    const client = await db.getClient();
    let order;
    let voucher = null;
    let amount = Math.round(originalAmount);
    let discountAmount = 0;

    try {
        await client.query('BEGIN');

        if (hasVoucher) {
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
                [`voucher-code:${String(voucherCode).trim().toUpperCase()}`, 'redeem']
            );

            const validation = await validateVoucherForCheckout({
                planCode,
                billingPeriod,
                userId,
                userEmail,
                code: voucherCode,
                queryable: client,
                pendingWindowMinutes,
            });
            if (!validation.voucher) {
                throw { status: 400, message: 'Voucher không hợp lệ hoặc không đủ điều kiện' };
            }

            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
                [`voucher:${validation.voucher.id}`, 'redeem']
            );

            const recheck = await validateVoucherForCheckout({
                planCode,
                billingPeriod,
                userId,
                userEmail,
                code: voucherCode,
                queryable: client,
                pendingWindowMinutes,
            });
            if (!recheck.voucher || Number(recheck.voucher.id) !== Number(validation.voucher.id)) {
                throw { status: 400, message: 'Voucher không hợp lệ hoặc đã hết lượt sử dụng' };
            }

            voucher = recheck.voucher;
            discountAmount = Number(voucher.discountAmount || 0);
            amount = Number(voucher.finalAmount || 0);
        }

        order = await createOrder({
            orderCode,
            planId: plan.id,
            amount,
            userEmail,
            userId,
            billingPeriod,
            originalAmount,
            discountAmount,
            voucherId: voucher?.id || null,
            voucherCode: voucher?.code || null,
            status: amount <= 0 ? 'success' : 'pending',
            paymentMethod: amount <= 0 ? 'voucher' : 'payos',
        }, client);

        if (amount <= 0) {
            await redeemVoucherForOrder(order, client);
            if (userId) await activateUserPlan(userId, plan.id, billingPeriod, client);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    if (amount <= 0) {
        return {
            orderCode,
            originalAmount: Math.round(originalAmount),
            discountAmount,
            amount,
            voucher,
            noPayment: true,
        };
    }

    const expiredAt = Math.floor(Date.now() / 1000) + pendingWindowMinutes * 60;

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
        voucher,
        expiredAt,
    };
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

            const userId = order.user_id || (order.user_email ? await findUserIdByEmail(order.user_email) : null);
            if (userId && order.plan_id) {
                await activateUserPlan(userId, order.plan_id, order.billing_period || 'monthly', client);

                // Gửi email xác nhận thanh toán thành công (async)
                const user = await findActiveUserByEmail(order.user_email);
                const plan = await findPlanById(order.plan_id);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + (plan?.duration_days || 30));

                sendSystemEmail(
                    buildPaymentSuccessEmail({
                        fullName: user?.full_name,
                        email: order.user_email,
                        planName: plan?.name || 'Unknown Plan',
                        amount: order.amount,
                        billingPeriod: order.billing_period || 'monthly',
                        orderCode: order.order_code,
                        paymentMethod: order.payment_method,
                        expiresAt,
                        invoiceUrl: `${FRONTEND_URL}/invoices/${order.order_code}`,
                    })
                ).catch((err) => console.error('[PaymentSuccessEmail] Failed to send:', err.message));
            } else {
                console.warn(`[Webhook] Không tìm được user cho đơn ${webhookData.orderCode} — plan chưa được kích hoạt`);
            }

            await redeemVoucherForOrder(order, client);
            await client.query('COMMIT');
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
    }

    return { orderCode };
};

export const getOrderStatus = async (orderCode) => {
    return await findOrderStatusByCode(orderCode);
};
