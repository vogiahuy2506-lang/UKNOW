import { findPlanByCode, getPlanByUserId } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import { validateVoucherForCheckout } from '../voucher.service.js';
import {
    createOrder,
    findOrderStatusByCode,
    updateOrderStatus,
    findOrderByCode,
    activateUserPlan,
    findUserIdByEmail,
    hasSuccessfulOrderForPlanByUser,
} from '../../repositories/payment/payment.repository.js';
import { redeemVoucherForOrder } from '../../repositories/voucher.repository.js';

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

export const createPaymentLink = async ({ planCode, userEmail, userId = null, billingPeriod = 'monthly', voucherCode = null }) => {
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');
    await assertTrialNotRegisteredTwice({ plan, userId, userEmail });
    await assertNoImmediateDowngrade({ targetPlan: plan, userId });

    // Xác định số tiền theo chu kỳ thanh toán
    const originalAmount = billingPeriod === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly)
        : Number(plan.price);

    if (originalAmount <= 0) throw new Error('Giá tiền không hợp lệ cho gói này');

    let voucher = null;
    let amount = Math.round(originalAmount);
    let discountAmount = 0;
    if (String(voucherCode || '').trim()) {
        const validation = await validateVoucherForCheckout({
            planCode,
            billingPeriod,
            userId,
            userEmail,
            code: voucherCode,
        });
        if (!validation.voucher) throw { status: 400, message: 'Voucher không hợp lệ hoặc không đủ điều kiện' };
        voucher = validation.voucher;
        discountAmount = Number(voucher.discountAmount || 0);
        amount = Number(voucher.finalAmount || 0);
    }

    const orderCode = Date.now();

    const order = await createOrder({
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
    });

    if (amount <= 0) {
        await redeemVoucherForOrder(order);
        if (userId) await activateUserPlan(userId, plan.id, billingPeriod);
        return {
            orderCode,
            originalAmount: Math.round(originalAmount),
            discountAmount,
            amount,
            voucher,
            noPayment: true,
        };
    }

    const paymentLink = await payosClient.paymentRequests.create({
        orderCode: Number(orderCode),
        amount,
        description: `TT ${planCode}`.substring(0, 25),
        returnUrl: `${process.env.FRONTEND_URL}/payment-success`,
        cancelUrl: `${process.env.FRONTEND_URL}/checkout`,
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
    };
};

export const handleWebhook = async (body) => {
    const webhookData = await payosClient.webhooks.verify(body);

    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

    if (webhookData.code === '00') {
        const order = await findOrderByCode(webhookData.orderCode);

        if (order?.status === 'cancelled') {
            console.warn(`[Webhook] Đơn ${webhookData.orderCode} đã bị huỷ — bỏ qua kích hoạt plan`);
            return webhookData;
        }

        await updateOrderStatus(webhookData.orderCode, 'success');
        await redeemVoucherForOrder(order);

        const userId = order?.user_id || (order?.user_email ? await findUserIdByEmail(order.user_email) : null);
        if (userId && order?.plan_id) {
            await activateUserPlan(userId, order.plan_id, order.billing_period || 'monthly');
        } else {
            console.warn(`[Webhook] Không tìm được user cho đơn ${webhookData.orderCode} — plan chưa được kích hoạt`);
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

    const orderCode = Date.now();

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
