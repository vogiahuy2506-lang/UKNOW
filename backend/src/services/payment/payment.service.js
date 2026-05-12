import { findPlanByCode } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import { createOrder, findOrderStatusByCode, updateOrderStatus, findOrderByCode, activateUserPlan, findUserIdByEmail } from '../../repositories/payment/payment.repository.js';

export const createPaymentLink = async ({ planCode, userEmail, userId = null }) => {
    // 1. Lấy plan từ DB
    const plan = await findPlanByCode(planCode);
    if (!plan) throw new Error('Gói không tồn tại');

    // 2. Tạo orderCode unique
    const orderCode = Date.now();

    // 3. Lưu order vào DB với status pending
    await createOrder({
        orderCode,
        planId: plan.id,
        amount: plan.price,
        userEmail,
        userId,
    });

    // 4. Gọi PayOS
    const paymentLink = await payosClient.paymentRequests.create({
        orderCode: Number(orderCode),
        amount: Number(plan.price),
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

        // Bỏ qua nếu đơn đã bị huỷ bởi admin
        if (order?.status === 'cancelled') {
            console.warn(`[Webhook] Đơn ${webhookData.orderCode} đã bị huỷ — bỏ qua kích hoạt plan`);
            return webhookData;
        }

        await updateOrderStatus(webhookData.orderCode, 'success');

        const userId = order?.user_id || (order?.user_email ? await findUserIdByEmail(order.user_email) : null);
        if (userId && order?.plan_id) {
            await activateUserPlan(userId, order.plan_id);
        } else {
            console.warn(`[Webhook] Không tìm được user cho đơn ${webhookData.orderCode} — plan chưa được kích hoạt`);
        }
    }

    return webhookData;
};

export const getOrderStatus = async (orderCode) => {
    return await findOrderStatusByCode(orderCode);
}