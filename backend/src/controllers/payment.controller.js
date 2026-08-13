import * as paymentService from '../services/payment/payment.service.js';
import {
  verifyMatbaoWebhookSecret,
  handleMatbaoCqtWebhook,
  getInvoiceForOwner,
  streamInvoicePdfForOwner,
} from '../services/payment/einvoiceView.service.js';

export const createPayment = async (req, res) => {
    try {
        const {
            planCode,
            billingPeriod = 'monthly',
            voucherCode = null,
            explicitVoucherCode = null,
            invoiceInfo = null,
        } = req.body;
        const userEmail = req.user?.email;
        if (!planCode || !userEmail) {
            return res.status(400).json({ error: 'Thiếu planCode hoặc thông tin người dùng' });
        }
        if (!['monthly', 'yearly'].includes(billingPeriod)) {
            return res.status(400).json({ error: 'billingPeriod phải là monthly hoặc yearly' });
        }

        const result = await paymentService.createPaymentLink({
            planCode,
            userEmail,
            userId: req.user.id,
            billingPeriod,
            voucherCode,
            explicitVoucherCode,
            invoiceInfo,
        });
        res.json({ success: true, message: 'Tạo liên kết thanh toán thành công', result });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
    }
};

export const createCustomPayment = async (req, res) => {
    try {
        const {
            quantities,
            billingPeriod = 'monthly',
            voucherCode = null,
            explicitVoucherCode = null,
            reusePlanId = null,
            invoiceInfo = null,
        } = req.body || {};

        if (!quantities || typeof quantities !== 'object') {
            return res.status(400).json({ success: false, message: 'Thiếu quantities' });
        }
        if (!['monthly', 'yearly'].includes(billingPeriod)) {
            return res.status(400).json({ success: false, message: 'billingPeriod phải là monthly hoặc yearly' });
        }

        const result = await paymentService.createCustomPaymentLink({
            quantities,
            userEmail: req.user.email,
            userId: req.user.id,
            billingPeriod,
            voucherCode,
            explicitVoucherCode,
            reusePlanId: reusePlanId ? Number(reusePlanId) : null,
            invoiceInfo,
        });
        res.json({ success: true, message: 'Tạo liên kết thanh toán gói tự chọn thành công', result });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({
            success: false,
            message: err.message || 'Lỗi server',
            code: err.code,
            capacity: err.capacity,
        });
    }
};

export const webhook = async (req, res) => {
    try {
        await paymentService.handleWebhook(req.body);
        res.json({ success: true, message: 'Webhook processed' });
    } catch (err) {
        console.error('Webhook error:', err.message);
        // Transient errors only — amount mismatch is acknowledged inside handleWebhook (200).
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
};

export const activateFree = async (req, res) => {
    try {
        const { planCode, billingPeriod = 'monthly' } = req.body;
        if (!planCode) return res.status(400).json({ error: 'Thiếu planCode' });
        if (!['monthly', 'yearly'].includes(billingPeriod)) {
            return res.status(400).json({ error: 'billingPeriod phải là monthly hoặc yearly' });
        }

        const result = await paymentService.activateFreePlan({
            planCode,
            userId: req.user.id,
            userEmail: req.user.email,
            billingPeriod,
        });
        res.json({ success: true, result });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
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

        // When logged in, only the buyer may read status (reduces probing of others' codes).
        if (req.user) {
            const isOwner =
                Number(order.user_id) === Number(req.user.id) ||
                (order.user_email &&
                    String(order.user_email).toLowerCase() === String(req.user.email || '').toLowerCase());
            if (!isOwner) {
                return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
            }
        }

        // Status only — never expose email/user_id.
        res.json({ success: true, message: 'Lấy trạng thái thanh toán thành công', status: order.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/** Mat Bao CQT webhook — public, secret in path. Always 200 after auth (except bad secret → 404). */
export const einvoiceWebhook = async (req, res) => {
    try {
        if (!verifyMatbaoWebhookSecret(req.params.secret)) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }
        const result = await handleMatbaoCqtWebhook(req.body || {});
        return res.status(200).json({ success: true, matched: result.matched });
    } catch (err) {
        console.error('[MatBaoWebhook] error:', err?.message || err);
        // Still 200 to avoid retry storms; secret was valid.
        return res.status(200).json({ success: true, matched: false, error: true });
    }
};

/** Owner-only invoice view for /invoices/:orderCode */
export const getInvoiceForOrder = async (req, res) => {
    try {
        const { orderCode } = req.params;
        if (!orderCode || !req.user?.id) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hoá đơn' });
        }
        const result = await getInvoiceForOwner(orderCode, req.user.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hoá đơn' });
        }
        return res.json({ success: true, result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/** Owner-only PDF stream — never redirect to Mat Bao URL. */
export const downloadInvoicePdf = async (req, res) => {
    try {
        const { orderCode } = req.params;
        if (!orderCode || !req.user?.id) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hoá đơn' });
        }
        const result = await streamInvoicePdfForOwner(orderCode, req.user.id);
        if (result.status === 404) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hoá đơn' });
        }
        if (result.status === 409) {
            return res.status(409).json({
                success: false,
                message: 'Hóa đơn chưa sẵn sàng để tải',
                code: result.code || 'INVOICE_PDF_NOT_READY',
            });
        }
        res.setHeader('Content-Type', result.contentType || 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${result.filename || `hoa-don-${orderCode}.pdf`}"`,
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.send(result.buffer);
    } catch (err) {
        console.error('[InvoicePdf]', err?.message || err);
        return res.status(502).json({ success: false, message: 'Không tải được PDF hóa đơn' });
    }
};
