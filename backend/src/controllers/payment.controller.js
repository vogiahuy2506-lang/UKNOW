import * as paymentService from '../services/payment/payment.service.js';

export const createPayment = async (req, res) => {
    try {
        const { planCode, userEmail } = req.body;
        if (!planCode || !userEmail) {
            return res.status(400).json({ error: 'Thiếu planCode hoặc userEmail' });
        }

        const result = await paymentService.createPaymentLink({ planCode, userEmail });
        res.json({ success: true, message: 'Tạo liên kết thanh toán thành công', result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

export const webhook = async (req, res) => {
    try {
        await paymentService.handleWebhook(req.body);
        res.json({ success: true, message: 'Webhook processed' });
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(200).json({ success: false });
    }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { orderCode } = req.params;
        if (!orderCode) {
            return res.status(400).json({ error: 'Thiếu orderCode' });
        }

        const order = await paymentService.getOrderStatus(orderCode);
        if (!order) {
            return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
        }

        res.json({ success: true, message: 'Lấy trạng thái thanh toán thành công', status: order.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}