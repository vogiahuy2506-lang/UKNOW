import { findPlanByCode } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import { createOrder, findOrderStatusByCode, updateOrderStatus, findOrderByCode, activateUserPlan, findUserIdByEmail } from '../../repositories/payment/payment.repository.js';

export const createPaymentLink = async ({ planCode, userEmail, userId = null, billingPeriod = 'monthly' }) => {
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');

    // Xác định số tiền theo chu kỳ thanh toán
    const amount = billingPeriod === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly)
        : Number(plan.price);

    if (amount <= 0) throw new Error('Giá tiền không hợp lệ cho gói này');

    const orderCode = Date.now();

    await createOrder({
        orderCode,
        planId: plan.id,
        amount,
        userEmail,
        userId,
        billingPeriod,
    });

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
