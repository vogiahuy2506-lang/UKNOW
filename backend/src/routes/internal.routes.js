/**
 * internal.routes.js
 *
 * Routes used by sibling services running inside the same trust boundary
 * (e.g. the Python `telegram-gateway`). They authenticate with a
 * shared secret rather than the user JWT — no UKNOW user is logged in.
 */
import express from 'express';
import db from '../config/database.js';
import chatbotTelegramRepository from '../repositories/chatbot/chatbotTelegram.repository.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import inboundReplyDebounceService from '../services/chatbot/inboundReplyDebounce.service.js';
import telegramAdapter from '../services/chatbot/channelAdapters/telegram.adapter.js';
import unifiedInboxRepository from '../repositories/ai/unifiedInbox.repository.js';
import {
  ensureTelegramInboxConversation,
  findTelegramInboxConversation,
  persistTelegramChannelMessage,
  bindTelegramChannelMessageId,
  broadcastTelegramInbox,
} from '../services/chatbot/telegramInbox.service.js';
import { buildAiPausePayload } from '../utils/aiHandoffResume.util.js';
import { isOwnerOutgoingEcho } from '../utils/ownerOutgoingEcho.util.js';
import {
  isStubOnly,
} from '../services/chatbot/inProcChannelGateway/index.js';

const isTelegramStubOnly = () => isStubOnly({ channel: 'telegram' });

const router = express.Router();

function requireGatewaySecret(req, res, next) {
  Promise.resolve()
    .then(() => telegramAdapter.verifyWebhookSecret(req.headers['x-gateway-secret']))
    .then(() => next())
    .catch((err) =>
      res.status(401).json({ success: false, message: err.message })
    );
}

/**
 * Pick the chatbot to handle a NEW conversation for a given Telegram account.
 * Uses the same round-robin-by-id approach as
 * chatbotZaloAccountRepository.pickEnabledChatbotForZalo so that successive
 * new conversations spread across chatbots fairly.
 */
async function pickEnabledChatbotForTelegram(userId, telegramAccountId, seed = 0) {
  const { rows } = await db.query(
    `SELECT tcs.id_chatbot
       FROM telegram_chatbot_settings tcs
       JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.is_active = true
      WHERE tcs.id_telegram_account = $1
        AND tcs.id_chatbot IS NOT NULL
        AND tcs.is_enabled = true
        AND (tcs.is_enabled_dm = true OR tcs.is_enabled_group = true)
      ORDER BY tcs.id_chatbot ASC`,
    [telegramAccountId]
  );
  if (rows.length === 0) return null;
  const idx = ((Number(seed) || 0) % rows.length + rows.length) % rows.length;
  return Number(rows[idx].id_chatbot);
}

/**
 * Trả về true nếu `id_chatbot` hiện tại của conversation vẫn còn
 * enabled cho account (chưa bị user gỡ qua DeployTab, custom_chatbots
 * vẫn active). Bug #1 dùng để quyết định có re-pick hay không.
 */
async function isChatbotStillEnabledForAccount(telegramAccountId, idChatbot) {
  if (!idChatbot) return false;
  const { rows } = await db.query(
    `SELECT 1
       FROM telegram_chatbot_settings tcs
       JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.is_active = true
      WHERE tcs.id_telegram_account = $1
        AND tcs.id_chatbot = $2
        AND tcs.is_enabled = true
        AND (tcs.is_enabled_dm = true OR tcs.is_enabled_group = true)
      LIMIT 1`,
    [telegramAccountId, idChatbot]
  );
  return rows.length > 0;
}

/**
 * Find or create a `telegram_personal_conversations` row for a given
 * (account, peer). The unique constraint is on (account, external_id, status)
 * so closing a conversation and starting again yields a fresh row.
 */
async function getOrCreateTelegramConversation(account, chatId, displayName) {
  const { rows: existing } = await db.query(
    `SELECT * FROM telegram_personal_conversations
     WHERE id_telegram_account = $1
       AND external_id = $2
       AND status = 'open'
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT 1`,
    [account.id, String(chatId)]
  );
  if (existing[0]) {
    return existing[0];
  }

  // Bot chọn sẵn một chatbot để lần tới không phải dò lại.
  let idChatbot = await pickEnabledChatbotForTelegram(
    account.id_user,
    account.id,
    Math.floor(Date.now() / 1000)
  );

  const { rows: created } = await db.query(
    `INSERT INTO telegram_personal_conversations
       (id_user, id_telegram_account, external_id, display_name, id_chatbot, status)
     VALUES ($1, $2, $3, $4, $5, 'open')
     ON CONFLICT (id_telegram_account, external_id, status) DO UPDATE SET
       last_message_at = NOW(),
       display_name = COALESCE(EXCLUDED.display_name, telegram_personal_conversations.display_name)
     RETURNING *`,
    [account.id_user, account.id, String(chatId), displayName || null, idChatbot]
  );
  return created[0];
}

/**
 * Ghi MỘT tin vào `telegram_personal_messages` (bảng cũ) và — khi hội thoại đã có dòng Hộp thư
 * (`conversation.inbox`) — ghi song song vào `channel_messages` + phát SSE (P1, PLAN_TG_WA_DAY_DU).
 * Dòng `system` ("[Telegram] skip …") CHỈ ở bảng cũ: đó là nhật ký vận hành, không phải tin của khách/chủ,
 * để vào Hộp thư sẽ hiện như một tin nhắn thật.
 * Lỗi ở đây không được nổi lên caller — lịch sử là best-effort.
 *
 * @param {object} conversation - dòng telegram_personal_conversations (bản sao) + `inbox` tuỳ chọn
 * @param {object} [options]
 * @param {boolean} [options.broadcast=true] - false: caller tự phát SSE (kèm trạng thái tạm dừng AI)
 * @returns {Promise<{legacyId: number|null, channelMessageId: number|null, duplicate: boolean}>}
 */
async function recordTelegramMessage(conversation, role, content, metadata = {}, options = {}) {
  const { broadcast = true, attachments = [], messageType = 'text' } = options;
  let legacyId = null;
  if (conversation?.id) {
    try {
      const result = await db.query(
        `INSERT INTO telegram_personal_messages
           (id_conversation, id_user, external_message_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          conversation.id,
          conversation.id_user,
          metadata.external_message_id || null,
          role,
          content || null,
          JSON.stringify(metadata || {}),
        ]
      );
      legacyId = result.rows[0]?.id ?? null;
      await db.query(
        `UPDATE telegram_personal_conversations
         SET last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [conversation.id]
      );
    } catch (err) {
      console.warn('[Telegram] logTelegramMessage failed:', err.message);
    }
  }

  let channelMessageId = null;
  let duplicate = false;
  const inbox = conversation?.inbox;
  if (inbox?.id && role !== 'system' && content) {
    try {
      const saved = await persistTelegramChannelMessage({
        conversation: inbox,
        userId: conversation.id_user,
        role,
        content,
        externalId: metadata.external_message_id ?? null,
        metadata: {
          source: metadata.source || null,
          chat_id: metadata.chat_id ?? null,
          // P5: ly do khong luu duoc anh/tep khach gui (qua 20 MB / dinh dang la / het dung luong / loi tai).
          ...(metadata.media_skip_reason ? { media_skip_reason: metadata.media_skip_reason } : {}),
        },
        attachments,
        messageType,
      });
      channelMessageId = saved?.id ?? null;
      duplicate = saved?.duplicate === true;
      // P5: tep khach gui dang o 'temp' (het han sau 24h) — doi sang 'active' ngay khi dong tin da ghi, khong thi anh
      // trong Hop thu mat sau mot ngay. Import tre: chi keo kho tep vao khi that su co tep.
      let presentedAttachments = [];
      if (attachments.length > 0 && !duplicate) {
        const inboundMedia = await import('../services/chatbot/channelInboundMedia.service.js');
        await inboundMedia.promoteInboundAttachments(attachments);
        presentedAttachments = inboundMedia.presentInboundAttachments(attachments);
      }
      if (broadcast && !duplicate) {
        const isVisitor = role === 'visitor';
        broadcastTelegramInbox({
          ownerUserId: conversation.id_user,
          conversation: inbox,
          // Tin AI/bot: cùng cách Zalo cá nhân báo SSE (role 'agent', tên 'AI').
          role: isVisitor ? 'visitor' : 'agent',
          message: content,
          messageId: channelMessageId,
          senderId: isVisitor ? (metadata.sender_id ?? null) : null,
          senderName: isVisitor ? (metadata.sender_name ?? null) : 'AI',
          isGroup: metadata.is_group === true,
          ...(messageType !== 'text' ? { extra: { messageType, attachments: presentedAttachments } } : {}),
        });
      }
    } catch (err) {
      console.warn('[Telegram] channel_messages dual-write failed:', err.message);
    }
  }
  return { legacyId, channelMessageId, duplicate };
}

/** Như cũ: trả id dòng bảng cũ (dùng cho throughMessageId / excludeMessageIds của chatRouter). */
async function logTelegramMessage(conversation, role, content, metadata = {}, options = {}) {
  const rec = await recordTelegramMessage(conversation, role, content, metadata, options);
  return rec.legacyId;
}

/**
 * Ghi id tin Telegram vừa gửi vào dòng bot đã lưu — để khi tài khoản đẩy lại tin đó
 * (isOutgoing) ta nhận ra là echo, không phải chủ gõ tay. Best-effort.
 * `ref` = kết quả `recordTelegramMessage` (cả hai bảng) hoặc id dòng bảng cũ.
 */
async function bindTelegramOutboundId(ref, messageId) {
  if (messageId == null || messageId === '') return;
  const legacyId = ref && typeof ref === 'object' ? ref.legacyId : ref;
  const channelMessageId = ref && typeof ref === 'object' ? ref.channelMessageId : null;
  if (legacyId) {
    try {
      await db.query(
        `UPDATE telegram_personal_messages SET external_message_id = $2 WHERE id = $1`,
        [legacyId, String(messageId)]
      );
    } catch (err) {
      console.warn('[Telegram] bind outbound message id failed:', err.message);
    }
  }
  if (channelMessageId) await bindTelegramChannelMessageId(channelMessageId, messageId);
}

/**
 * Chủ tài khoản tự gõ từ điện thoại/app Telegram (mtcute `isOutgoing`): KHÔNG đi đường AI.
 * Echo của tin bot/Hộp thư vừa gửi → bỏ (so id/nội dung với `channel_messages`, nơi Hộp thư và AI đều ghi
 * id tin thật). Tin thật của chủ → ghi dòng `agent` (cả hai bảng) + tạm dừng AI cho hội thoại Hộp thư
 * (`setAiPaused` 'handoff', tự bật lại theo `ai_handoff_auto_resume_minutes` trong `isAiPaused`) + phát SSE.
 * Nhóm bỏ; hội thoại chưa có (khách chưa từng nhắn) bỏ.
 */
async function handleTelegramOwnerOutgoing({ account, parsed }) {
  if (parsed.isGroup || !parsed.chatId) return { handled: false, reason: 'group_or_no_chat' };
  const inbox = await findTelegramInboxConversation(account, parsed.chatId);
  if (!inbox?.id) return { handled: false, reason: 'no_conversation' };

  let isEcho = false;
  try {
    const { rows: recent } = await db.query(
      `SELECT external_id, content, created_at
         FROM channel_messages
        WHERE id_conversation = $1
          AND role IN ('bot', 'agent')
          AND created_at >= NOW() - INTERVAL '5 minutes'
        ORDER BY id DESC
        LIMIT 40`,
      [inbox.id]
    );
    isEcho = isOwnerOutgoingEcho({
      incomingId: parsed.messageId,
      incomingContent: parsed.message,
      candidates: (recent || []).map((r) => ({
        externalId: r.external_id,
        content: r.content,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.warn('[Telegram] owner outgoing echo check failed (will pause):', err.message);
  }
  if (isEcho) {
    console.log('[Telegram] owner outgoing = echo, skip', { conversationId: inbox.id, messageId: parsed.messageId });
    return { handled: false, reason: 'echo' };
  }

  // Bảng cũ: dòng `agent` vào hội thoại đang mở (nếu có) để lịch sử cũ đủ.
  let legacy = null;
  try {
    const { rows } = await db.query(
      `SELECT * FROM telegram_personal_conversations
       WHERE id_telegram_account = $1
         AND external_id = $2
         AND status = 'open'
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 1`,
      [account.id, String(parsed.chatId)]
    );
    legacy = rows[0] || null;
  } catch (err) {
    console.warn('[Telegram] owner outgoing legacy lookup failed:', err.message);
  }
  const conversation = { ...(legacy || { id: null, id_user: account.id_user }), inbox };
  await recordTelegramMessage(
    conversation,
    'agent',
    parsed.message,
    {
      external_message_id: parsed.messageId != null ? String(parsed.messageId) : null,
      source: 'owner_phone',
      chat_id: parsed.chatId,
    },
    { broadcast: false }
  );

  // Tạm dừng kiểu handoff; setAiPaused không ghi đè tạm dừng TAY (ai_paused_at NULL).
  const pausedRow = await unifiedInboxRepository.setAiPaused(inbox.id, 'channel', true, 'handoff');
  const pauseState = await buildAiPausePayload({
    aiPaused: pausedRow.aiPaused,
    aiPausedAt: pausedRow.aiPausedAt,
    ownerUserId: account.id_user,
  });
  broadcastTelegramInbox({
    ownerUserId: account.id_user,
    conversation: inbox,
    role: 'agent',
    message: parsed.message,
    isGroup: false,
    extra: { isSelf: true, ...pauseState },
  });
  console.log('[Telegram] owner replied from phone → AI paused', { conversationId: inbox.id });
  return { handled: true, conversationId: inbox.id };
}

/**
 * Tạm dừng AI: MỘT nguồn sự thật là `channel_conversations.ai_paused*` (Hộp thư). `isAiPaused` tự bật lại
 * khi quá `ai_handoff_auto_resume_minutes`. Cột `telegram_personal_conversations.ai_paused*` để nguyên,
 * KHÔNG còn được đọc hay ghi.
 */
async function isTelegramAiPaused(conversation) {
  if (!conversation?.inbox?.id) return false;
  return unifiedInboxRepository.isAiPaused(conversation.inbox.id, 'channel');
}

/**
 * Debounce-flushed handler for a batched personal Telegram conversation.
 * Encapsulates the policy checks (settings enabled? DM/group honour?
 * paused?) and the AI call + reply. Pulled out of the inline handler
 * so the route reads as "validate then enqueue".
 *
 * ── Settings merge (Bug sếp gặp 22/09) ─────────────────────────────────
 * Trước đây merged settings chỉ chứa 3 cột từ `telegram_chatbot_settings`
 * (is_enabled / is_enabled_dm / is_enabled_group) → AI không thấy
 * `system_instruction`, `welcome_message`, `ai_model`, `temperature`,
 * `max_tokens`, `response_style`, `id_sub_assistant` do user cấu hình
 * trong Studio → câu trả lời "không tuân theo cấu hình".
 *
 * Sau fix 22/09: lấy THÊM `chatbot_settings.channel='telegram_personal'` rồi merge.
 * PR-3 (PLAN_CONG_TAC_TRANG_THAI_CHATBOT 29/09) — thứ tự ưu tiên ĐẢO so với bản 22/09:
 *   - Các field AI/system/welcome/style lấy từ CHATBOT ĐƯỢC GÁN cho tài khoản
 *     (`accountSettings.chatbot_*`, JOIN sống `custom_chatbots` trong
 *     chatbotTelegram.repository getSettingsForAccount). `chatbot_settings` kênh chỉ là
 *     DỰ PHÒNG khi chatbot để trống — dòng kênh đó theo TÀI KHOẢN (UNIQUE id_user, channel)
 *     và bị hộp Cấu hình Studio ghi đè bằng chatbot nào lưu SAU CÙNG: tài khoản 2 chatbot,
 *     gán Telegram cho B nhưng lưu A sau → Telegram trả lời bằng hướng dẫn của A.
 *     Zalo cá nhân đã đúng thứ tự này (zaloInbox.service.js ~796-812).
 *   - 3 cột enable lấy từ `accountSettings` (override per-account); nếu cả 2 cùng truthy
 *     thì `accountSettings.is_enabled_dm/group` đè lên `chatbotSettings.is_enabled`.
 */
async function processTelegramPersonalBatch({ account, parsed, batch }) {
  const peer = parsed.chatId || parsed.senderId;
  // Bản sao: `inbox` (dòng Hộp thư) gắn thêm bên dưới, không làm bẩn dòng gốc.
  const conversation = { ...(await getOrCreateTelegramConversation(
    account,
    peer,
    parsed.senderName
  )) };

  // ── NEW (Bug #1): re-evaluate chatbot theo cấu hình hiện tại ─────
  // Trước đây lấy thẳng `conversation.id_chatbot` (đã bị khoá cứng
  // từ lúc tạo hội thoại). Nếu user đổi chatbot qua DeployTab thì
  // hội thoại đang mở vẫn dùng chatbot cũ → "đổi cấu hình nhưng
  // câu trả lời không đổi".
  //
  // Semantics:
  //   - Sticky: nếu chatbot hiện tại (conversation.id_chatbot) vẫn
  //     enabled cho account này → giữ nguyên.
  //   - Switch: nếu nó bị xoá/vô hiệu/đổi id_chatbot ở DeployTab
  //     → pick lại từ danh sách enabled (round-robin), UPDATE
  //     conversation row để các message sau dùng luôn id mới.
  //
  // Lưu ý: KHÔNG mutate `conversation.id_chatbot` in-memory — chỉ
  // update DB và dùng local `idChatbot` cho phần dưới để tránh
  // side-effect nếu caller giữ reference tới conversation row.
  let idChatbot = conversation.id_chatbot;
  const currentStillValid = await isChatbotStillEnabledForAccount(
    account.id,
    idChatbot
  );
  if (!currentStillValid) {
    const rePicked = await pickEnabledChatbotForTelegram(
      account.id_user,
      account.id,
      conversation.id // seed = conversation id để deterministic
    );
    if (rePicked && rePicked !== idChatbot) {
      try {
        await db.query(
          `UPDATE telegram_personal_conversations
             SET id_chatbot = $2,
                 updated_at = NOW()
           WHERE id = $1`,
          [conversation.id, rePicked]
        );
        console.log('[Telegram] re-picked chatbot for conversation', {
          conversationId: conversation.id,
          oldIdChatbot: idChatbot,
          newIdChatbot: rePicked,
        });
        idChatbot = rePicked;
      } catch (err) {
        console.warn('[Telegram] failed to persist re-picked chatbot:', err.message);
      }
    } else if (rePicked) {
      idChatbot = rePicked;
    } else {
      // Không còn chatbot nào enabled → giữ idChatbot cũ (sẽ bị
      // skip ở is_enabled check dưới, có system log rõ ràng).
      console.log('[Telegram] no enabled chatbot to re-pick', {
        conversationId: conversation.id,
        oldIdChatbot: idChatbot,
      });
    }
  }

  // Resolve AI settings: prefer the per-(account, chatbot) row, fall
  // back to the channel-level settings so legacy setups still work.
  const chatbotSettings = await chatbotRepository.getSettings(
    account.id_user,
    'telegram_personal'
  );
  let accountSettings = null;
  if (idChatbot) {
    // Đổi raw query → dùng repo `getSettingsForAccount` (đã JOIN
    // `custom_chatbots.*` để expose `chatbot_system_instruction` +
    // các field AI default của chatbot). Tương đương
    // `chatbotZaloAccount.repository.getSettings` — fix bug 22/09
    // "AI Telegram không tuân theo system_instruction".
    accountSettings = await chatbotTelegramRepository.getSettingsForAccount(
      account.id,
      idChatbot
    );
  }

  console.log('[Telegram] resolved settings', {
    accountId: account.id,
    idChatbot,
    hasChatbotSettings: !!chatbotSettings,
    hasAccountSettings: !!accountSettings,
    accountSettings_is_enabled_dm: accountSettings?.is_enabled_dm,
    accountSettings_is_enabled_group: accountSettings?.is_enabled_group,
    chatbotSettings_is_enabled_dm: chatbotSettings?.is_enabled_dm,
  });

  // ── NEW: merge full settings ──────────────────────────────────────
  // Trước đây chỉ pass `accountSettings` (3 cột) hoặc fallback
  // `chatbotSettings`. Test file `internalTelegramWebhook.spec.js`
  // pin expect() cho từng field để bug này không regression.
  let mergedSettings = mergeAccountAndChatbotSettings(
    accountSettings,
    chatbotSettings
  );

  // PR-3: ưu tiên/dự phòng system_instruction nằm TRONG mergeAccountAndChatbotSettings (đọc `_source`).

  // ── P1 (PLAN_TG_WA_DAY_DU): hội thoại vào Hộp thư hợp nhất ─────────────
  // Đảm bảo có dòng channel_conversations rồi LƯU TIN KHÁCH TRƯỚC mọi nhánh return bên dưới
  // (chatbot tắt / DM tắt / nhóm tắt / AI đang dừng / khoá / ngoài giờ / hết lượt): khách nhắn thì
  // chủ luôn thấy trong Hộp thư, dù không có AI trả lời (khuôn WhatsApp "Lưu tin khách TRƯỚC khi kiểm").
  // Nhóm CHỈ vào Hộp thư khi nhóm được bật AI cho tài khoản: tài khoản ở nhiều nhóm sôi nổi sẽ làm ngập Hộp thư
  // (bảng cũ telegram_personal_* vẫn ghi như trước). DM luôn vào. Gateway không gửi tiêu đề nhóm nên đặt tên
  // "Nhóm <chatId>" — `senderName` là người gửi, dùng làm tên nhóm sẽ hiển thị sai người.
  const inboxEligible = !parsed.isGroup || (mergedSettings.is_enabled && mergedSettings.is_enabled_group);
  try {
    if (inboxEligible) conversation.inbox = await ensureTelegramInboxConversation({
      account,
      chatId: peer,
      displayName: parsed.isGroup ? `Nhóm ${peer}` : parsed.senderName,
      idChatbot,
      isGroup: parsed.isGroup,
      legacyConversationId: conversation.id ?? null,
      legacyPause: { ai_paused: conversation.ai_paused, ai_paused_at: conversation.ai_paused_at },
    });
  } catch (err) {
    console.warn('[Telegram] ensure inbox conversation failed (tiếp tục không có Hộp thư):', err.message);
  }

  // Log visitor messages first so the UI shows them even if the AI
  // call fails. Track IDs so we can exclude them from history.
  // `batch` do InboundReplyDebounceService là OBJECT `{ messages: [...] }` (không phải mảng). Bản cũ chỉ nhận
  // mảng nên luôn rơi về tin cuối cùng → cả đợt nhắn dồn chỉ lưu/trả lời tin cuối, các tin trước MẤT khỏi lịch sử
  // và khỏi Hộp thư. Lấy đúng danh sách tin; vẫn nhận mảng trần (đường gọi kiểu cũ).
  const batchList = Array.isArray(batch)
    ? batch
    : (Array.isArray(batch?.messages) ? batch.messages : []);
  const batchItems = batchList.length ? batchList : [{ content: parsed.message }];
  const visitorMessageIds = [];
  for (const item of batchItems) {
    if (!item?.content) continue;
    const insertedId = await logTelegramMessage(conversation, 'visitor', item.content, {
      external_message_id: item.eventId ?? null,
      sender_id: parsed.senderId,
      sender_name: parsed.senderName,
      chat_id: parsed.chatId,
      is_group: parsed.isGroup,
      media_skip_reason: item.mediaSkipReason ?? null,
    }, {
      // P5: anh/tep khach gui (da tai + luu o webhook) đi cung dong tin; tin chu thuan giu nguyen (khong co 2 truong nay).
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
      messageType: item.messageType || 'text',
    });
    if (insertedId) visitorMessageIds.push(insertedId);
  }

  // Nếu account đã tắt chatbot cho kênh này (is_enabled=false hoặc
  // dm/group disabled tuỳ loại), ghi một system row để operator thấy
  // khi đọc log + DB, RỒI return. Không được swallow im lặng.
  if (!mergedSettings.is_enabled) {
    const reason = !accountSettings
      ? 'no_per_account_settings'
      : !accountSettings.is_enabled
      ? 'account_disabled'
      : 'merged_disabled';
    await logTelegramMessage(
      conversation,
      'system',
      `[Telegram] skip — ${reason}`,
      { reason, accountId: account.id, idChatbot }
    );
    console.log('[Telegram] batch skip: chatbot disabled', {
      accountId: account.id,
      idChatbot,
      reason,
    });
    return;
  }
  if (parsed.isGroup && !mergedSettings.is_enabled_group) {
    await logTelegramMessage(
      conversation,
      'system',
      '[Telegram] skip — group messages disabled for this account',
      { accountId: account.id, idChatbot }
    );
    console.log('[Telegram] batch skip: group disabled', { accountId: account.id });
    return;
  }
  if (!parsed.isGroup && !mergedSettings.is_enabled_dm) {
    await logTelegramMessage(
      conversation,
      'system',
      '[Telegram] skip — DM messages disabled for this account',
      { accountId: account.id, idChatbot }
    );
    console.log('[Telegram] batch skip: dm disabled', {
      accountId: account.id,
      idChatbot,
      is_enabled_dm: mergedSettings.is_enabled_dm,
      accountSettings_is_enabled_dm: accountSettings?.is_enabled_dm,
      chatbotSettings_is_enabled_dm: chatbotSettings?.is_enabled_dm,
      conversationId: conversation?.id,
    });
    return;
  }
  if (await isTelegramAiPaused(conversation)) {
    console.log('[Telegram] batch skip: AI paused by owner', {
      conversationId: conversation?.id
    });
    return;
  }

  // Combine the batched messages (if any) with the current one so
  // bursty inputs become one AI call. Fallback to the original
  // payload when `batch` is missing the helper aggregation we
  // expect (older unit-style paths).
  const batchedContent = batchList.length
    ? batchList
        .map((m) => (m && m.content ? String(m.content) : ''))
        .filter(Boolean)
        .join('\n')
    : parsed.message;

  // Get latest message ID in this conversation (for throughMessageId).
  // This ensures AI only sees history BEFORE this batch, not including
  // the visitor messages we just logged.
  let throughMessageId = null;
  try {
    const latestResult = await db.query(
      `SELECT id FROM telegram_personal_messages
       WHERE id_conversation = $1
       ORDER BY id DESC
       LIMIT 1`,
      [conversation.id]
    );
    // If we haven't logged any visitor messages yet, throughMessageId = latest ID (old history only)
    // If we have logged visitor messages, throughMessageId = the MIN of visitor IDs (history up to before batch)
    if (visitorMessageIds.length > 0) {
      throughMessageId = Math.min(...visitorMessageIds);
    } else {
      throughMessageId = latestResult.rows[0]?.id ?? null;
    }
  } catch (err) {
    console.warn('[Telegram] failed to get throughMessageId:', err.message);
  }

  console.log(
    '[Telegram] batch dispatching to AI',
    { accountId: account.id, idChatbot, length: batchedContent?.length, throughMessageId, visitorMessageIds: visitorMessageIds.length }
  );

  // P6 — tài khoản Telegram bị khoá (vượt hạn mức gói / slot hết hạn): không gọi AI. Tin khách đã lưu ở trên.
  {
    const { resourceIsLocked: accountIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await accountIsLocked('telegram_accounts', account.id)) {
      console.log('[Telegram] account locked — message saved, no AI reply', { accountId: account.id });
      return;
    }
  }

  // Khoá tài nguyên (hạ gói / hết hạn): chatbot bị khoá thì không gọi AI. Tin khách đã lưu ở trên.
  if (idChatbot) {
    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('chatbots', idChatbot)) {
      console.log('[Telegram] chatbot locked — message saved, no AI reply', {
        accountId: account.id,
        idChatbot,
      });
      return;
    }
  }

  // Active hours check (trước khi gọi AI, sau khi đã lưu tin visitor)
  let chatbotRecord = null;
  if (idChatbot) {
    chatbotRecord = await chatbotRepository.findChatbotById(idChatbot);
  }

  const { default: chatbotActiveHoursService } = await import('../services/chatbot/chatbotActiveHours.service.js');
  const activeCheck = await chatbotActiveHoursService.checkBeforeAi({
    activeHours: chatbotRecord?.active_hours,
    repliesEnabled: chatbotRecord?.replies_enabled,
    channel: 'telegram_personal',
    chatbotId: idChatbot || account.id,
    senderKey: parsed.senderId,
  });
  if (!activeCheck.allowed) {
    if (activeCheck.shouldNotify) {
      const staticRowId = await recordTelegramMessage(conversation, 'bot', activeCheck.staticReply, {
        model: 'ai_outside_hours',
        replySource: 'ai_outside_hours',
      });
      try {
        const sentStatic = await telegramAdapter.sendReply({
          userId: account.id_user,
          channelId: account.id,
          externalId: peer,
          message: activeCheck.staticReply,
        });
        await bindTelegramOutboundId(staticRowId, sentStatic?.messageId);
        await chatbotActiveHoursService.markNotified({
          channel: 'telegram_personal',
          chatbotId: idChatbot || account.id,
          senderKey: parsed.senderId,
          activeHours: chatbotRecord?.active_hours,
        });
      } catch (sendErr) {
        console.warn('[Telegram] sendReply outside hours failed:', sendErr.message);
      }
    }
    console.log('[Telegram] outside active hours — message saved, no AI reply', {
      accountId: account.id,
      idChatbot,
    });
    return;
  }

  // Trần lượt trả lời (mỗi đợt gom một lần) — khuôn zaloInbox.service.js.
  const { default: chatbotRateLimitService } = await import('../services/chatbot/chatbotRateLimit.service.js');
  const rate = await chatbotRateLimitService.checkBeforeAi({
    channel: 'telegram_personal',
    ownerUserId: account.id_user,
    chatbotId: idChatbot || account.id,
    senderKey: parsed.senderId,
  });
  if (!rate.allowed) {
    if (rate.shouldNotify) {
      const rateRowId = await recordTelegramMessage(conversation, 'bot', rate.staticReply, {
        model: 'ai_rate_limited',
        replySource: 'ai_rate_limited',
      });
      try {
        const sentRate = await telegramAdapter.sendReply({
          userId: account.id_user,
          channelId: account.id,
          externalId: peer,
          message: rate.staticReply,
        });
        await bindTelegramOutboundId(rateRowId, sentRate?.messageId);
        await chatbotRateLimitService.markRateLimitNotified({
          channel: 'telegram_personal',
          ownerUserId: account.id_user,
          chatbotId: idChatbot || account.id,
          senderKey: parsed.senderId,
          reason: rate.reason,
        });
      } catch (sendErr) {
        console.warn('[Telegram] sendReply rate-limited failed:', sendErr.message);
      }
    }
    console.log('[Telegram] rate limited — message saved, no AI reply', {
      accountId: account.id,
      idChatbot,
      reason: rate.reason,
    });
    return;
  }

  const result = await chatRouterService.routeMessageWithSettings({
    channel: 'telegram_personal',
    userId: account.id_user,
    chatbotId: idChatbot,
    message: batchedContent,
    conversationId: conversation?.id,
    // Chỉ lấy lịch sử TRƯỚC batch hiện tại, không lấy 20 tin gần nhất.
    // throughMessageId đảm bảo chỉ thấy tin trước khi visitor nhắn batch này.
    // excludeMessageIds loại trừ visitor messages trong batch để AI không thấy lặp.
    throughMessageId,
    excludeMessageIds: visitorMessageIds,
    // TRƯỚC: `accountSettings || chatbotSettings || {}` (3-cột row mất
    //        toàn bộ system_instruction, ai_model, response_style… →
    //        "không tuân theo cấu hình"). SAU: mergedSettings = union
    //        của 2 row với override đúng field.
    chatbotSettings: mergedSettings,
    visitorInfo: {
      source: 'telegram_personal',
      telegram_account_id: account.id,
      telegram_user_id: parsed.telegramUserId,
      sender_id: parsed.senderId,
      sender_name: parsed.senderName,
      chat_id: parsed.chatId,
      is_group: parsed.isGroup,
    },
  });

  console.log('[Telegram] routeMessageWithSettings result', {
    accountId: account.id,
    idChatbot,
    conversationId: conversation?.id,
    resultType: result?.type,
    hasContent: !!result?.content,
    contentLen: result?.content?.length,
    merged_is_enabled: mergedSettings?.is_enabled,
    merged_is_enabled_dm: mergedSettings?.is_enabled_dm,
    throughMessageId,
    visitorMessageIds: visitorMessageIds.length,
    batchSize: batchItems.length,
  });

  const replyText = result?.content;
  console.log(
    `[Telegram] AI replied: ${replyText ? replyText.length + ' chars' : '(empty)'} -> logging + sending`,
    { conversationId: conversation?.id, peer }
  );
  if (replyText) {
    const botRowId = await recordTelegramMessage(conversation, 'bot', replyText, {
      model:
        mergedSettings.ai_model || 'gemini-2.5-flash',
    });
    console.log(`[Telegram] bot message logged, now sendReply → peer=${peer}`);
    try {
      const sentReply = await telegramAdapter.sendReply({
        userId: account.id_user,
        channelId: account.id,
        externalId: peer,
        message: replyText,
      });
      await bindTelegramOutboundId(botRowId, sentReply?.messageId);
      console.log(`[Telegram] sendReply OK to ${peer}`);
    } catch (sendErr) {
      console.warn('[Telegram] sendReply failed:', sendErr.message);
    }
  }
}

/**
 * Merge account-level enable flags với channel-level AI config.
 * Đảm bảo:
 *   - 3 cột `is_enabled*` ưu tiên `accountSettings` (override per-account).
 *   - Tất cả field AI/system/welcome lấy từ `chatbotSettings`.
 *   - Nếu `accountSettings` null, fallback `chatbotSettings` (mặc định enabled).
 *   - Nếu `chatbotSettings` null, chỉ dùng `accountSettings` (CHỈ có 3 cột —
 *     vẫn tốt hơn nothing, sẽ dùng default Gemini từ chatRouter).
 *
 * Test pin: `expect(merged.system_instruction).toBe(...)` v.v.
 */
/** Giá trị đầu tiên "có cấu hình": không null/undefined và (nếu là chuỗi) không rỗng. */
function pickConfigured(...values) {
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

function mergeAccountAndChatbotSettings(accountSettings, chatbotSettings) {
  const base = chatbotSettings || {};
  const acc = accountSettings || {};
  // PR-3: chatbot ĐƯỢC GÁN (acc.chatbot_*) trước, dòng chatbot_settings kênh (base) chỉ dự phòng.
  const systemInstruction = pickConfigured(acc.chatbot_system_instruction, base.system_instruction);
  const systemInstructionSource = pickConfigured(acc.chatbot_system_instruction) != null
    ? 'custom_chatbots'
    : (systemInstruction != null ? 'chatbot_settings' : null);
  return {
    id_sub_assistant: base.id_sub_assistant ?? acc.id_sub_assistant ?? null,
    sub_assistant_name: base.sub_assistant_name ?? null,
    system_instruction: systemInstruction,
    welcome_message: pickConfigured(acc.chatbot_welcome_message, base.welcome_message, base.greeting_msg),
    greeting_msg: base.greeting_msg ?? null,
    ai_model: pickConfigured(acc.chatbot_ai_model, base.ai_model),
    temperature: pickConfigured(acc.chatbot_temperature, base.temperature),
    max_tokens: pickConfigured(acc.chatbot_max_tokens, base.max_tokens),
    response_style: pickConfigured(acc.chatbot_response_style, base.response_style),

    // Enable flags — chatbotSettings cho default, accountSettings override
    // (giữ semantic cũ: nếu accountSettings.is_enabled=false → tắt,
    //  ngược lại lấy giá trị chatbotSettings).
    is_enabled: acc.is_enabled ?? base.is_enabled ?? true,
    is_enabled_dm: acc.is_enabled_dm ?? base.is_enabled_dm ?? true,
    is_enabled_group: acc.is_enabled_group ?? base.is_enabled_group ?? true,

    // Metadata để debug
    _source: {
      account: acc ? 'telegram_chatbot_settings' : null,
      chatbot: base ? 'chatbot_settings' : null,
      system_instruction: systemInstructionSource,
    },
  };
}

/**
 * POST /api/internal/telegram-webhook
 *
 * Receives incoming messages that the Python gateway has already parsed
 * into JSON. Verifies the shared secret, picks the right chatbot, runs
 * the AI pipeline, and replies via the gateway.
 */
router.post('/telegram-webhook', requireGatewaySecret, async (req, res) => {
  try {
    const parsed = telegramAdapter.parseWebhookEvent(req.body);
    // P5: tin khach gui CHI co anh/tai lieu (khong caption) truoc day bi bo o day. Gio di tiep neu co media — tru tin do
    // CHINH tai khoan gui (isOutgoing, vd echo anh minh vua gui): khong chu thi bo nhu cu.
    const hasInboundMedia = Boolean(parsed.media) && !parsed.isOutgoing;
    if ((!parsed.message && !hasInboundMedia) || !parsed.senderId) {
      console.log('[Telegram] webhook skip: no message/sender', { parsed });
      return res.status(204).end();
    }

    const telegramUserId = parsed.telegramUserId;
    if (!telegramUserId) {
      console.log('[Telegram] webhook skip: no telegramUserId', { parsed });
      return res.status(204).end();
    }

    const account = await chatbotTelegramRepository.getAccountByTelegramUserId(telegramUserId);
    if (!account || !account.is_active) {
      console.log(
        '[Telegram] webhook skip: account not found or inactive',
        { telegramUserId, accountFound: !!account }
      );
      return res.status(204).end();
    }

    // Chủ tự gõ từ điện thoại (mtcute isOutgoing): không đi đường AI — ghi tin + dừng AI, hoặc bỏ nếu là echo.
    if (parsed.isOutgoing) {
      await handleTelegramOwnerOutgoing({ account, parsed });
      return res.status(204).end();
    }

    // We enqueue into the debounce service exactly the way the
    // Zalo / WhatsApp webhooks do: it batches fast bursts into a
    // single AI call, tracks seen event ids across retries, and
    // calls `flushCallback` when the bucket drains.
    //
    // `parsed.messageId` comes from `telegramAdapter.parseWebhookEvent`
    // which reads `body.message_id` — we surface it explicitly so the
    // debounce service can collapse provider retries (mtcute reconnects,
    // forwarder HTTP timeouts) into a single AI call. Without this, the
    // dedupe Set in `InboundReplyDebounceService` saw `null` eventId on
    // every inbound and could not dedupe — every retry produced a fresh
    // batch.
    // P5: tai + luu anh/tai lieu khach gui. Noi dung gui AI la caption hoac cho giu cho "[Hình ảnh]" / "[Tệp]".
    let inboundContent = parsed.message;
    let inboundAttachments = [];
    let inboundMediaSkipReason = null;
    let inboundMessageType = 'text';
    if (hasInboundMedia) {
      const { resolveTelegramInboundMedia } = await import('../services/chatbot/telegramInboundMedia.service.js');
      const resolved = await resolveTelegramInboundMedia({ account, parsed });
      inboundContent = resolved.content;
      inboundAttachments = resolved.attachments;
      inboundMediaSkipReason = resolved.skipReason;
      inboundMessageType = resolved.kind;
    }

    const debounceKey = `telegram_personal:${account.id}:${parsed.chatId || parsed.senderId}`;
    const enqueueResult = inboundReplyDebounceService.enqueue({
      key: debounceKey,
      message: {
        eventId: parsed.messageId ?? null,
        content: inboundContent,
        ...(hasInboundMedia
          ? { attachments: inboundAttachments, messageType: inboundMessageType, mediaSkipReason: inboundMediaSkipReason }
          : {}),
        metadata: {
          senderId: parsed.senderId,
          senderName: parsed.senderName,
          chatId: parsed.chatId,
          isGroup: parsed.isGroup,
        },
      },
      flushCallback: async (batch) => {
        console.log(`[Telegram] debounce flush: key=${debounceKey} batchSize=${batch.messages.length} reason=${batch.reason} waitMs=${batch.waitMs}`);
        try {
          await processTelegramPersonalBatch({
            account,
            parsed,
            batch,
          });
        } catch (batchErr) {
          console.error(`[Telegram] processTelegramPersonalBatch THREW for key=${debounceKey}:`, batchErr.stack || batchErr.message);
          throw batchErr;
        }
      },
    });
    console.log(`[Telegram] enqueued: key=${debounceKey} messageId=${parsed.messageId ?? 'null'} enqueued=${enqueueResult.enqueued} duplicate=${!!enqueueResult.duplicate} nextBatch=${!!enqueueResult.nextBatch}`);

    return res.status(204).end();
  } catch (err) {
    console.error('[Telegram] webhook error:', err);
    // Always 204 to avoid the gateway retrying noisy failures.
    return res.status(204).end();
  }
});

/**
 * GET /api/internal/telegram-health
 * Lightweight readiness check used by the gateway on startup.
 *
 * The `stubOnly` flag lets an operator (or a health-monitor dashboard)
 * spot at a glance whether the channel is running on its stub
 * transport — in which case all QR login endpoints will return 503
 * with `code: 'TELEGRAM_STUB_TRANSPORT'`.
 */
router.get('/telegram-health', requireGatewaySecret, (req, res) => {
  const stubOnly = isTelegramStubOnly();
  return res.json({
    status: stubOnly ? 'stub' : 'ok',
    stubOnly,
    transport: process.env.TELEGRAM_GATEWAY_TRANSPORT || null,
  });
});

export default router;
