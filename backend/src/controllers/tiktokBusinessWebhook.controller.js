/**
 * tiktokBusinessWebhook.controller.js
 *
 * Webhook controller cho TikTok Business Messaging (mount ở `webhook.routes.js`).
 * Tách riêng khỏi `chatbotChannelWebhook.controller.js` (file kia đã 960 dòng +
 * pattern chat-router khác với Business Messaging flow) để dễ test + bảo trì.
 *
 * Flow:
 *   0. Bí mật trong đường dẫn: `POST /api/webhooks/tiktok-business/:secret` phải khớp env
 *      TIKTOK_WEBHOOK_PATH_SECRET (so sánh hằng thời gian; thiếu cấu hình = từ chối). `client_key`
 *      KHÔNG phải bí mật (nằm trong URL OAuth công khai) nên không đủ làm xác thực, và bản TikTok
 *      hiện chưa có chữ ký webhook đã kiểm chứng — dùng cùng mẫu với webhook Mắt Bão (`/einvoice/webhook/:secret`).
 *      Sai/thiếu bí mật vẫn trả 200 (TikTok không gửi lại dồn dập) nhưng KHÔNG xử lý sự kiện nào.
 *   1. Verify client_key ∈ TIKTOK_APP_CLIENT_KEYS (Bẫy plan §5.2) — lớp phụ.
 *   2. Parse body — KHÔNG cần raw body (Bẫy 5 plan — verified ở PR-1).
 *   3. Branch theo 8 event từ docs v1.3 (research §event types).
 *   4. im_send_msg / im_receive_msg / im_referral_msg → route qua
 *      `chatRouter.service` (giống Facebook/WhatsApp flow).
 *   5. im_mark_read_msg, im_mark_read_msg_eu, account_status_update, policy_violation,
 *      business_profile_update → chỉ log + touchWebhook.
 *
 * Pattern copy từ `chatbotChannelWebhook.controller.js` (handler Facebook).
 * Bẫy 10 plan: phân biệt event EU/non-EU qua `event` name (im_receive_msg vs
 * im_receive_msg_eu, im_mark_read_msg vs im_mark_read_msg_eu) — chỉ xử lý non-EU.
 *
 * Việc 5 của plan tiktok-business-messaging-integration.md.
 */

import crypto from 'crypto';
import chatbotChannelRepository from '../repositories/ai/chatbotChannel.repository.js';
import tiktokBusinessAccountRepository from
  '../repositories/ai/tiktokBusinessAccount.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import tiktokBusinessAdapter from '../services/chatbot/channelAdapters/tiktokBusiness.adapter.js';
import tiktokRateLimitService from '../services/chatbot/tiktokRateLimit.service.js';

const SUPPORTED_EVENTS = new Set([
  'im_send_msg',
  'im_receive_msg',
  'im_referral_msg',
  'im_mark_read_msg',
  'im_mark_read_msg_eu',
  'im_receive_high_intent_comment',
  'account_status_update',
  'policy_violation',
  'business_profile_update',
]);

/**
 * Bí mật nằm trong đường dẫn webhook (`/tiktok-business/:secret`). So sánh hằng thời gian; thiếu cấu hình
 * (`TIKTOK_WEBHOOK_PATH_SECRET` trống) hoặc thiếu giá trị gửi lên → false (đóng-khi-lỗi, khác whitelist client_key bên dưới).
 * Cùng mẫu với `verifyMatbaoWebhookSecret` (einvoiceView.service.js).
 *
 * @param {unknown} provided phần `:secret` trong URL
 * @returns {boolean}
 */
export function verifyTiktokWebhookPathSecret(provided) {
  const expected = String(process.env.TIKTOK_WEBHOOK_PATH_SECRET || '');
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Whitelist client_key. Mỗi app TikTok có 1 client_key riêng. Khi UKNOW
 * onboard nhiều app (dev/staging/prod), cấu hình TIKTOK_APP_CLIENT_KEYS=
 * "key_dev,key_staging,key_prod". Trống = log warn + vẫn xử lý (giống
 * `zaloOaWebhookSecrets` ở chatbotChannelWebhook.controller.js:107-112).
 */
function isClientKeyAllowed(clientKey) {
  const allowed = String(process.env.TIKTOK_APP_CLIENT_KEYS || '').trim();
  if (!allowed) {
    // Fail-open theo pattern zaloOaWebhookSecrets
    console.warn(
      '[TikTokWebhook] TIKTOK_APP_CLIENT_KEYS chưa cấu hình, chấp nhận mọi client_key. '
        + 'Set env để whitelist.'
    );
    return true;
  }
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(String(clientKey || '').trim());
}

class TiktokBusinessWebhookController {
  /**
   * POST /api/webhooks/tiktok-business/:secret
   * Entry point. TikTok gửi batch 1 hoặc nhiều event. Đường cũ KHÔNG có `:secret` vẫn được mount nhưng
   * không bao giờ xử lý (trả 200 để TikTok không gửi lại) — xem verifyTiktokWebhookPathSecret.
   */
  async handle(req, res) {
    try {
      // 1. Phải respond 200 trong vòng 3s (Bẫy plan §5).
      // Trả 200 ngay, xử lý event trong background.
      res.status(200).json({ success: true });

      // 1b. Bí mật đường dẫn — KHÔNG xử lý gì (kể cả vô hiệu hoá tài khoản ở account_status_update) nếu sai/thiếu.
      // Không ghi giá trị bí mật vào log.
      if (!verifyTiktokWebhookPathSecret(req.params?.secret)) {
        console.warn('[TikTokWebhook] bỏ qua webhook: thiếu hoặc sai bí mật đường dẫn (TIKTOK_WEBHOOK_PATH_SECRET)');
        return;
      }

      const body = req.body || {};
      const events = Array.isArray(body.events) ? body.events : [body];

      // 2. Lấy client_key từ envelope (TikTok gửi ở top level)
      const clientKey = body.client_key;
      if (!isClientKeyAllowed(clientKey)) {
        console.warn('[TikTokWebhook] client_key bị từ chối:', clientKey);
        return;
      }

      // 3. Process từng event
      // (KHÔNG await toàn bộ — tránh block response)
      for (const ev of events) {
        this._processEvent(ev).catch((err) => {
          console.error('[TikTokWebhook] _processEvent error:', err.message, err.stack);
        });
      }
    } catch (err) {
      console.error('[TikTokWebhook] handle error:', err.message);
      // Vẫn trả 200 (TikTok retry nếu 4xx/5xx → có thể flood)
      try {
        if (!res.headersSent) res.status(200).json({ success: true });
      } catch {
        // ignore
      }
    }
  }

  /**
   * Xử lý 1 event. Pattern copy từ chatbotChannelWebhook.controller.js:
   * - Branch theo `event` name
   * - Tìm channel qua `business_id` (external_channel_id)
   * - Gọi chatRouter để generate reply
   * - Send reply qua adapter
   *
   * @param {object} ev - { event, create_time, user_openid, content, ... }
   */
  async _processEvent(ev) {
    const event = ev?.event;
    if (!SUPPORTED_EVENTS.has(event)) {
      console.warn('[TikTokWebhook] event không hỗ trợ:', event);
      return;
    }

    // 4. Bẫy 10: EU events bị từ chối ở docs (TikTok API EU region restriction)
    if (event === 'im_receive_msg_eu' || event === 'im_mark_read_msg_eu') {
      console.warn(`[TikTokWebhook] EU event ${event} bị bỏ qua theo policy`);
      return;
    }

    // 5. Parse content — TikTok gửi content dạng STRING (Bẫy 2 plan)
    let content = ev?.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch (parseErr) {
        console.warn('[TikTokWebhook] content parse fail:', parseErr.message);
        return;
      }
    }
    if (!content) {
      console.warn('[TikTokWebhook] content rỗng, bỏ qua event');
      return;
    }

    // 6. Lấy business_id
    const businessId = content?.to_user?.id;
    if (!businessId) {
      console.warn('[TikTokWebhook] thiếu to_user.id (business_id), bỏ qua event');
      return;
    }

    // 7. Tìm account (internal — webhook global, không có userId context)
    const accountRow = await tiktokBusinessAccountRepository.findByBusinessIdAnyUser(businessId);
    if (!accountRow) {
      console.warn('[TikTokWebhook] Không tìm thấy account cho business_id:', businessId);
      return;
    }
    // Touch last_webhook_at
    await tiktokBusinessAccountRepository.touchWebhook(accountRow.id);

    // 8. Branch theo event
    switch (event) {
      case 'im_send_msg':
      case 'im_receive_msg':
      case 'im_receive_high_intent_comment':
        await this._handleInboundMessage({ accountRow, ev, content, event });
        return;

      case 'im_referral_msg':
        await this._handleInboundMessage({
          accountRow, ev, content, event, isReferral: true,
        });
        return;

      case 'im_mark_read_msg':
        // Tin nhắn user đã đọc — chỉ log, không generate reply
        console.log(`[TikTokWebhook] mark_read event: conv=${content?.conversation_id}`);
        return;

      case 'account_status_update':
        // Account bị suspend/restrict → deactivate local
        console.warn('[TikTokWebhook] account_status_update:', ev);
        if (ev?.status === 'suspended' || ev?.status === 'banned') {
          await tiktokBusinessAccountRepository.deactivate(
            accountRow.id,
            accountRow.id_user
          );
        }
        return;

      case 'policy_violation':
      case 'business_profile_update':
        // Chỉ log; không có tác động tự động
        console.log(`[TikTokWebhook] ${event}:`, JSON.stringify(ev).slice(0, 500));
        return;

      default:
        return;
    }
  }

  /**
   * Handle inbound message (im_send_msg / im_receive_msg / im_referral_msg /
   * im_receive_high_intent_comment). Gọi chatRouter để generate reply,
   * check rate limit, gửi qua adapter.
   */
  async _handleInboundMessage({ accountRow, ev, content, event, isReferral = false }) {
    // 1. Lấy conversation_id + user_openid
    const conversationId = content?.conversation_id;
    const uniqueIdentifier = content?.from_user?.id;
    if (!conversationId || !uniqueIdentifier) {
      console.warn('[TikTokWebhook] thiếu conversation_id hoặc from_user.id');
      return;
    }

    // 2. Tìm channel (chatbot_channel_connections) qua external_channel_id
    const channel = await chatbotChannelRepository.findActiveByExternalChannelId(
      'tiktok_business',
      accountRow.business_id
    );
    if (!channel) {
      console.warn(
        '[TikTokWebhook] Không có chatbot nào enable channel này:',
        accountRow.business_id
      );
      return;
    }

    // 3. Lấy nội dung text (chỉ xử lý text, image xử lý ở PR sau)
    const text = content?.text?.body || content?.comment_text || '';
    if (!text) {
      console.log('[TikTokWebhook] message không có text, bỏ qua (chỉ text ở PR-3)');
      return;
    }

    // 4. Rate limit check (Bẫy 3)
    const rateCheck = await tiktokRateLimitService.checkAndLog({
      businessId: accountRow.business_id,
      uniqueIdentifier,
      conversationId,
    });
    if (!rateCheck.allowed) {
      console.warn(
        `[TikTokWebhook] Rate limit: ${rateCheck.currentCount}/${rateCheck.limit} `
          + `cho user ${uniqueIdentifier}, bỏ qua reply.`
      );
      return;
    }

    // 5. Gọi chatRouter để generate reply
    let replyText;
    try {
      const routerResp = await chatRouterService.routeChatbotMessage?.({
        channel: 'tiktok_business',
        userId: accountRow.id_user,
        chatbotId: channel.id_chatbot,
        message: text,
        externalId: uniqueIdentifier,
        channelId: channel.id,
      });
      replyText = routerResp?.reply || routerResp?.text || '';
    } catch (routerErr) {
      console.error('[TikTokWebhook] chatRouter error:', routerErr.message);
      return;
    }
    if (!replyText) {
      console.log('[TikTokWebhook] chatRouter trả về rỗng, bỏ qua');
      return;
    }

    // 6. Send reply
    const sendResult = await tiktokBusinessAdapter.sendReply({
      accountId: accountRow.id,
      conversationId,
      message: replyText,
    });
    if (!sendResult.success) {
      console.error(
        '[TikTokWebhook] sendReply fail:',
        sendResult.error,
        sendResult.httpStatus
      );
    }
  }
}

export default new TiktokBusinessWebhookController();
