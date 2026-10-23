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
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import unifiedInboxRepository from '../repositories/ai/unifiedInbox.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import chatbotRateLimitService from '../services/chatbot/chatbotRateLimit.service.js';
import inboundReplyDebounceService from '../services/chatbot/inboundReplyDebounce.service.js';
import { formatBatchedContent } from '../utils/chatbotReplyBatch.util.js';
import { unavailableMetadata } from '../utils/aiUnavailable.util.js';
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
        // Tin do CHÍNH tài khoản gửi đi (kể cả bot vừa trả lời) — KHÔNG trả lời, tránh vòng lặp tự trả lời.
        return;

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
   * Handle inbound message (im_receive_msg / im_referral_msg / im_receive_high_intent_comment).
   * Lưu tin của khách rồi đưa vào hàng gom (debounce); việc kiểm tra + gọi AI + gửi trả lời nằm ở
   * `_processTiktokBatch`. `im_send_msg` (tin do chính tài khoản gửi) KHÔNG đi vào đây.
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

    // 4. Chatbot được gắn phải còn tồn tại và đang bật
    const chatbotId = channel.id_chatbot;
    const chatbot = chatbotId ? await chatbotRepository.findChatbotById(chatbotId) : null;
    if (!chatbot || !chatbot.is_active) {
      console.warn(`[TikTokWebhook] Chatbot ${chatbotId} không tồn tại hoặc đang tắt — bỏ qua`);
      return;
    }

    // 5. Hội thoại + lưu tin của khách (dedupe theo message_id để TikTok gửi lại không trả lời 2 lần)
    const conv = await chatbotChannelRepository.getOrCreateConversation({
      chatbotId,
      channelId: channel.id,
      externalId: uniqueIdentifier,
      source: 'tiktok_business',
    });
    const messageId = content?.message_id || content?.text?.message_id || null;
    const savedMessage = await chatbotChannelRepository.addMessage(conv.id, {
      role: 'visitor',
      content: text,
      message_type: 'text',
      external_id: messageId ? String(messageId) : undefined,
    });
    if (savedMessage?.isDuplicate) return;
    await chatbotChannelRepository.updateLastActivity(channel.id);

    // 6. Gom các tin nhắn dồn dập của cùng 1 khách thành 1 lượt trả lời
    inboundReplyDebounceService.enqueue({
      key: `tiktok_business:${channel.id}:${conv.id}`,
      message: {
        eventId: messageId,
        persistedMessageId: savedMessage?.id || null,
        receivedAt: Date.now(),
        content: text,
      },
      flushCallback: async (batch) => {
        await this._processTiktokBatch({
          accountRow,
          channel,
          chatbotId,
          conv,
          conversationId,
          uniqueIdentifier,
          batch,
        });
      },
    });
  }

  /**
   * Gửi 1 tin tĩnh (ngoài giờ / hết hạn mức AI) qua TikTok, có tính vào giới hạn 10 tin tự động / 48h.
   * @returns {Promise<boolean>} true nếu đã gửi và lưu
   */
  async _sendStaticNotice({ accountRow, conv, conversationId, uniqueIdentifier, message }) {
    const limit = await tiktokRateLimitService.checkAndLog({
      businessId: accountRow.business_id,
      uniqueIdentifier,
      conversationId,
    });
    if (!limit.allowed) return false;
    const sent = await tiktokBusinessAdapter.sendReply({
      accountId: accountRow.id,
      conversationId,
      message,
    });
    if (!sent?.success) return false;
    await chatbotChannelRepository.addMessage(conv.id, {
      role: 'bot',
      content: message,
      message_type: 'text',
    });
    return true;
  }

  /**
   * Xử lý 1 lượt tin nhắn đã gom của 1 hội thoại TikTok. Cùng chuỗi kiểm tra với Facebook/WhatsApp:
   * kênh+chatbot còn bật, khoá topup, tạm dừng AI (nhân viên tiếp quản), giờ hoạt động, hạn mức AI,
   * rồi giới hạn TikTok (10 tin tự động / 48h), gọi AI và gửi trả lời.
   */
  async _processTiktokBatch({
    accountRow, channel, chatbotId, conv, conversationId, uniqueIdentifier, batch,
  }) {
    const prompt = formatBatchedContent(batch.messages);
    if (!prompt) return;
    const logTag = `[ChatbotDebounce] channel=tiktok_business account=${channel.id} conversation=${conv.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason}`;

    try {
      // 1. Kênh + chatbot vẫn đang bật và vẫn gắn đúng chatbot này
      const activeChannel = await chatbotChannelRepository.findActiveChannelById(channel.id);
      if (!activeChannel || Number(activeChannel.id_chatbot) !== Number(chatbotId)) {
        console.log(`${logTag} result=disabled`);
        return;
      }
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || !chatbot.is_active) {
        console.log(`${logTag} result=disabled`);
        return;
      }

      // 2. Khoá tài nguyên (topup)
      const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
      if (await resourceIsLocked('chatbots', chatbotId)) {
        console.log(`${logTag} result=locked`);
        return;
      }

      // 3. Nhân viên đã tiếp quản hội thoại → AI im lặng
      if (await unifiedInboxRepository.isAiPaused(conv.id, 'channel')) {
        console.log(`${logTag} result=paused`);
        return;
      }

      // 4. Giờ hoạt động
      const { default: chatbotActiveHoursService } = await import('../services/chatbot/chatbotActiveHours.service.js');
      const activeCheck = await chatbotActiveHoursService.checkBeforeAi({
        activeHours: chatbot.active_hours,
        repliesEnabled: chatbot.replies_enabled,
        channel: 'tiktok_business',
        chatbotId,
        senderKey: uniqueIdentifier,
      });
      if (!activeCheck.allowed) {
        if (activeCheck.shouldNotify) {
          const ok = await this._sendStaticNotice({
            accountRow, conv, conversationId, uniqueIdentifier, message: activeCheck.staticReply,
          });
          if (ok) {
            await chatbotActiveHoursService.markNotified({
              channel: 'tiktok_business',
              chatbotId,
              senderKey: uniqueIdentifier,
              activeHours: chatbot.active_hours,
            });
          }
        }
        console.log(`${logTag} result=outside_hours`);
        return;
      }

      // 5. Hạn mức AI
      const rate = await chatbotRateLimitService.checkBeforeAi({
        channel: 'tiktok_business',
        ownerUserId: chatbot.id_user,
        chatbotId,
        senderKey: uniqueIdentifier,
      });
      if (!rate.allowed) {
        if (rate.shouldNotify) {
          const ok = await this._sendStaticNotice({
            accountRow, conv, conversationId, uniqueIdentifier, message: rate.staticReply,
          });
          if (ok) {
            await chatbotRateLimitService.markRateLimitNotified({
              channel: 'tiktok_business',
              ownerUserId: chatbot.id_user,
              chatbotId,
              senderKey: uniqueIdentifier,
              reason: rate.reason,
            });
          }
        }
        console.log(`${logTag} result=rate_limited`);
        return;
      }

      // 6. Giới hạn của TikTok: tối đa 10 tin tự động / 48h cho mỗi khách (Bẫy 3)
      const tiktokLimit = await tiktokRateLimitService.checkAndLog({
        businessId: accountRow.business_id,
        uniqueIdentifier,
        conversationId,
      });
      if (!tiktokLimit.allowed) {
        console.warn(
          `[TikTokWebhook] Rate limit: ${tiktokLimit.currentCount}/${tiktokLimit.limit} cho user ${uniqueIdentifier}, bỏ qua reply.`
        );
        console.log(`${logTag} result=tiktok_rate_limited`);
        return;
      }

      // 7. Gọi AI (lịch sử loại trừ các tin của lượt này vì đã nằm trong prompt)
      const historyThroughMessageId = await chatbotChannelRepository.getLatestMessageId(conv.id);
      const result = await chatRouterService.routeChatbotMessage({
        chatbotId,
        message: prompt,
        conversationId: conv.id,
        throughMessageId: historyThroughMessageId,
        excludeMessageIds: batch.messages
          .map((item) => item.persistedMessageId)
          .filter((id) => id != null),
      });
      if (!result?.content) {
        console.log(`${logTag} result=failed`);
        return;
      }

      // 8. Gửi trả lời cho khách
      const sent = await tiktokBusinessAdapter.sendReply({
        accountId: accountRow.id,
        conversationId,
        message: result.content,
      });
      if (!sent?.success) {
        console.error('[TikTokWebhook] sendReply fail:', sent?.error, sent?.httpStatus);
        console.log(`${logTag} result=failed`);
        return;
      }

      await chatbotChannelRepository.addMessage(conv.id, {
        role: 'bot',
        content: result.content,
        message_type: 'text',
        metadata: unavailableMetadata(result),
      });
      console.log(`${logTag} result=sent`);
    } catch (err) {
      console.error(`[ChatbotDebounce] Error processing TikTok batch for conv ${conv.id}:`, err.stack || err.message);
    }
  }
}

export default new TiktokBusinessWebhookController();
