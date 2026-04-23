import express from 'express';
import webhookController from '../controllers/webhook.controller.js';

const router = express.Router();

/**
 * POST /api/webhooks/woocommerce/order
 *
 * Endpoint công khai – không yêu cầu JWT.
 * WooCommerce gọi khi có sự kiện đơn hàng (tạo mới, cập nhật trạng thái, v.v.)
 *
 * Xác thực chữ ký HMAC-SHA256 được thực hiện bên trong controller
 * khi biến môi trường WC_WEBHOOK_SECRET được cấu hình.
 */
router.post(
  '/woocommerce/order',
  webhookController.handleOrder.bind(webhookController),
);

export default router;
