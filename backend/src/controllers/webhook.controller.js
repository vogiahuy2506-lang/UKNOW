import crypto from 'crypto';
import webhookOrderService from '../services/webhook/webhookOrder.service.js';

/**
 * WebhookController – xử lý webhook đơn hàng từ WooCommerce.
 *
 * Luồng xử lý khi nhận đơn hàng:
 *   1. Xác thực chữ ký HMAC-SHA256 (nếu cấu hình WC_WEBHOOK_SECRET)
 *   2. Parse UTM parameters từ _wc_order_attribution_session_entry:
 *      - utm_campaign: ID chiến dịch
 *      - utm_customer: ID khách hàng
 *      - utm_id_email: ID email message
 *      - utm_id_zalo_message: ID tin nhắn Zalo
 *      - utm_id_run: ID campaign run
 *   3. Yêu cầu tối thiểu: utm_campaign + (utm_id_email hoặc utm_id_zalo_message)
 *   4. Validate UTM parameters tồn tại trong database
 *   5. Tìm khách hàng theo email/phone
 *      - Zalo group: ưu tiên phone -> email
 *      - Zalo person/email campaign: ưu tiên email -> phone
 *      - Với các nguồn trên: có thể tạo mới nếu chưa có
 *   6. Ghi/Cập nhật customer_purchases với id_course (product_id) và id_campaign
 *      - Nếu đơn đã tồn tại và status thay đổi: update product_type
 *   7. Ghi customer_journey với event_type tùy theo order status:
 *      - completed/processing → "order_completed"
 *      - on-hold → "order_pending"
 *      - Mỗi lần webhook gọi sẽ ghi journey mới (tracking update)
 *   8. Cập nhật uknow_status trong campaign_customers (chỉ nâng cấp, không hạ)
 *
 * Biến môi trường:
 *   WC_WEBHOOK_SECRET     – secret để xác thực chữ ký (tùy chọn)
 *   WC_WEBHOOK_USER_ID    – id_user trong DB để gán khách hàng từ webhook
 */
class WebhookController {
  // Mapping trạng thái WooCommerce → uknow_status
  static WC_TO_UKNOW = {
    completed:  'purchased',
    processing: 'purchased',
    'on-hold':  'interested',
    pending:    'interested',
    cancelled:  null,
    refunded:   null,
    failed:     null,
  };

  // ─── Xác thực chữ ký HMAC-SHA256 ─────────────────────────────────────────

  _verifySignature(req) {
    const secret = process.env.WC_WEBHOOK_SECRET;
    if (!secret) return true; // chưa cấu hình – bỏ qua xác thực

    const receivedSig = req.headers['x-wc-webhook-signature'];
    if (!receivedSig) {
      console.warn('[Webhook] Thiếu header X-WC-Webhook-Signature');
      return false;
    }

    if (!req.rawBody) {
      console.error('[Webhook] req.rawBody không tồn tại – kiểm tra cấu hình express.json verify');
      return false;
    }

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('base64');

    // So sánh timing-safe để tránh timing attack
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSig, 'base64'),
        Buffer.from(expectedSig, 'base64'),
      );
    } catch {
      return false;
    }
  }

  // ─── Trích xuất payload ───────────────────────────────────────────────────

  /**
   * Chuẩn hóa giá trị utm_source cho webhook Zalo.
   *
   * @param {unknown} value
   * @returns {'zalo_group_campaign'|'zalo_person_campaign'|'email_campaign'|null}
   */
  _normalizeUtmSource(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return null;

    if (['zalo_group_campaign', 'zalo_group_campgingn'].includes(raw)) {
      return 'zalo_group_campaign';
    }
    if (['zalo_person_campaign', 'zalo_person_camgign'].includes(raw)) {
      return 'zalo_person_campaign';
    }
    if (['email_campaign', 'email_camgign'].includes(raw)) {
      return 'email_campaign';
    }
    return null;
  }

  _extractOrderFields(payload) {
    const billing = payload.billing ?? {};

    // Trích xuất UTM tracking từ _wc_order_attribution_session_entry
    const metaData = Array.isArray(payload.meta_data) ? payload.meta_data : [];
    const findMeta = (key) => {
      const item = metaData.find((m) => m.key === key || m.key === `_${key}`);
      return item?.value ?? null;
    };

    // Parse UTM từ session entry URL
    let utmCampaignId = null;
    let utmCustomerId = null;
    let utmEmailMsgId = null;
    let utmZaloMsgId = null;
    let utmRunId = null;
    let utmSource = null;
    let utmZaloUid = null;

    const sessionEntry = findMeta('wc_order_attribution_session_entry');
    if (sessionEntry) {
      try {
        const url = new URL(sessionEntry);
        const params = url.searchParams;

        utmCampaignId = parseInt(params.get('utm_campaign') ?? '0', 10) || null;
        utmCustomerId = parseInt(params.get('utm_customer') ?? '0', 10) || null;
        utmEmailMsgId = parseInt(params.get('utm_id_email') ?? '0', 10) || null;
        utmZaloMsgId = parseInt(params.get('utm_id_zalo_message') ?? '0', 10) || null;
        utmRunId = parseInt(params.get('utm_id_run') ?? '0', 10) || null;
        utmSource = this._normalizeUtmSource(params.get('utm_source'));
        utmZaloUid = String(params.get('utm_zalo_uid') ?? '').trim() || null;
      } catch (err) {
        console.warn('[Webhook] Lỗi parse URL từ session_entry:', err.message);
      }
    }

    const lineItems = (payload.line_items ?? []).map((item) => ({
      productId:   item.product_id,
      variationId: item.variation_id || null,
      name:        item.name,
      sku:         item.sku || null,
      quantity:    item.quantity,
      total:       parseFloat(item.total) || 0,
    }));

    return {
      orderId:       String(payload.id),
      orderNumber:   payload.number,
      status:        payload.status,
      dateCreated:   payload.date_created ? new Date(payload.date_created) : new Date(),
      currency:      payload.currency || 'VND',
      total:         parseFloat(payload.total) || 0,
      paymentMethod: payload.payment_method || null,
      billing: {
        fullName: `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim() || null,
        email:    billing.email?.toLowerCase().trim() || null,
        phone:    billing.phone?.trim() || null,
      },
      lineItems,
      utmCampaignId,
      utmCustomerId,
      utmEmailMsgId,
      utmZaloMsgId,
      utmRunId,
      utmSource,
      utmZaloUid,
    };
  }

  // ─── Handler chính ────────────────────────────────────────────────────────

  /**
   * POST /api/webhooks/woocommerce/order
   */
  handleOrder(req, res) {
    // Trả 200 ngay để WooCommerce không retry
    res.status(200).json({ success: true, message: 'Webhook nhận thành công' });

    setImmediate(async () => {
      try {
        // 1. Xác thực chữ ký
        if (!this._verifySignature(req)) {
          console.warn('[Webhook] Chữ ký không hợp lệ – payload bị bỏ qua');
          return;
        }

        const payload = req.body;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          console.warn('[Webhook] Payload không hợp lệ hoặc rỗng');
          return;
        }

        // 2. Kiểm tra WC_WEBHOOK_USER_ID
        const userId = parseInt(process.env.WC_WEBHOOK_USER_ID, 10);
        if (!Number.isFinite(userId)) {
          console.error('[Webhook] WC_WEBHOOK_USER_ID chưa cấu hình – bỏ qua lưu database');
          console.log('[Webhook] Raw payload:', JSON.stringify(payload, null, 2));
          return;
        }

        const order = this._extractOrderFields(payload);
        const newUknowStatus = WebhookController.WC_TO_UKNOW[order.status] ?? null;

        console.log(
          `[Webhook] Nhận đơn #${order.orderNumber} | WC status="${order.status}"` +
          ` | uknow_status="${newUknowStatus}" | email=${order.billing.email}` +
          ` | utm_campaign=${order.utmCampaignId ?? '-'} ` +
          ` | utm_source=${order.utmSource ?? '-'} ` +
          ` | utm_customer=${order.utmCustomerId ?? '-'} ` +
          ` | utm_id_email=${order.utmEmailMsgId ?? '-'} ` +
          ` | utm_id_zalo_message=${order.utmZaloMsgId ?? '-'} ` +
          ` | utm_id_run=${order.utmRunId ?? '-'} ` +
          ` | utm_zalo_uid=${order.utmZaloUid ?? '-'}`,
        );

        // Hỗ trợ tracking từ email hoặc Zalo:
        // yêu cầu campaign + một message id (email hoặc zalo).
        if (!order.utmCampaignId || (!order.utmEmailMsgId && !order.utmZaloMsgId)) {
          console.warn(
            `[Webhook] Thiếu UTM parameters: ` +
            `utm_campaign=${order.utmCampaignId ?? 'null'}, ` +
            `utm_id_email=${order.utmEmailMsgId ?? 'null'}, ` +
            `utm_id_zalo_message=${order.utmZaloMsgId ?? 'null'} – bỏ qua`,
          );
          return;
        }

        await webhookOrderService.processOrder({
          order,
          userId,
          newUknowStatus,
        });
      } catch (err) {
        console.error('[Webhook] Lỗi ngoài transaction:', err);
      }
    });
  }
}

export default new WebhookController();
