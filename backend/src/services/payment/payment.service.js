import { findPlanByCode } from '../../repositories/payment/plan.repository.js';
import payosClient from '../../utils/payos.util.js';
import { createOrder, findOrderStatusByCode, updateOrderStatus } from '../../repositories/payment/payment.repository.js';

export const createPaymentLink = async ({ planCode, userEmail }) => {
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
        await updateOrderStatus(webhookData.orderCode, 'success');
    }

    return webhookData;
};

export const getOrderStatus = async (orderCode) => {
    return await findOrderStatusByCode(orderCode);
}