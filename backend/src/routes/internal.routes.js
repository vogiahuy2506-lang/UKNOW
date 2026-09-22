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
 * Tiny helper to record one message in `telegram_personal_messages` and
 * bump `last_message_at` on the parent conversation. Failures here should
 * never bubble up to the caller — chat history is best-effort.
 */
async function logTelegramMessage(conversation, role, content, metadata = {}) {
  try {
    await db.query(
      `INSERT INTO telegram_personal_messages
         (id_conversation, id_user, external_message_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        conversation.id,
        conversation.id_user,
        metadata.external_message_id || null,
        role,
        content || null,
        JSON.stringify(metadata || {}),
      ]
    );
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

/**
 * Check the AI-paused flag on a Telegram conversation.
 */
async function isTelegramAiPaused(conversationId) {
  if (!conversationId) return false;
  const { rows } = await db.query(
    `SELECT ai_paused, ai_paused_at, id_user
     FROM telegram_personal_conversations
     WHERE id = $1`,
    [conversationId]
  );
  if (!rows[0] || rows[0].ai_paused !== true) return false;

  try {
    const { shouldStayAiPaused, getCachedAutoResumeMinutes } = await import(
      '../utils/aiHandoffResume.util.js'
    );
    const minutes = await getCachedAutoResumeMinutes(rows[0].id_user);
    if (shouldStayAiPaused({
      aiPaused: true,
      aiPausedAt: rows[0].ai_paused_at,
      autoResumeMinutes: minutes,
    })) {
      return true;
    }
    // Auto-expired → reset.
    await db.query(
      `UPDATE telegram_personal_conversations
       SET ai_paused = false, ai_paused_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );
  } catch (err) {
    console.warn('[Telegram] ai_paused auto-resume check failed:', err.message);
  }
  return false;
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
 * Sau fix: lấy THÊM `chatbot_settings.channel='telegram_personal'`
 * (full row đã LEFT JOIN `sub_assistants`) rồi merge:
 *   - Các field AI/system/welcome/style lấy từ `chatbotSettings` (config
 *     chính của chatbot — có thể share giữa nhiều channels).
 *   - 3 cột enable lấy từ `accountSettings` (override per-account).
 *   - Nếu cả 2 cùng truthy thì `accountSettings.is_enabled_dm/group`
 *     đè lên `chatbotSettings.is_enabled` (giữ semantic cũ).
 */
async function processTelegramPersonalBatch({ account, parsed, batch }) {
  const peer = parsed.chatId || parsed.senderId;
  const conversation = await getOrCreateTelegramConversation(
    account,
    peer,
    parsed.senderName
  );

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
    const { rows } = await db.query(
      `SELECT * FROM telegram_chatbot_settings
       WHERE id_telegram_account = $1 AND id_chatbot = $2`,
      [account.id, idChatbot]
    );
    accountSettings = rows[0] || null;
  }

  // ── NEW: merge full settings ──────────────────────────────────────
  // Trước đây chỉ pass `accountSettings` (3 cột) hoặc fallback
  // `chatbotSettings`. Test file `internalTelegramWebhook.spec.js`
  // pin expect() cho từng field để bug này không regression.
  const mergedSettings = mergeAccountAndChatbotSettings(
    accountSettings,
    chatbotSettings
  );

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
    console.log('[Telegram] batch skip: dm disabled', { accountId: account.id });
    return;
  }
  if (await isTelegramAiPaused(conversation?.id)) {
    console.log('[Telegram] batch skip: AI paused by owner', {
      conversationId: conversation?.id
    });
    return;
  }

  // Combine the batched messages (if any) with the current one so
  // bursty inputs become one AI call. Fallback to the original
  // payload when `batch` is missing the helper aggregation we
  // expect (older unit-style paths).
  const batchedContent = Array.isArray(batch) && batch.length
    ? batch
        .map((m) => (m && m.content ? String(m.content) : ''))
        .filter(Boolean)
        .join('\n')
    : parsed.message;

  console.log(
    '[Telegram] batch dispatching to AI',
    { accountId: account.id, idChatbot, length: batchedContent?.length }
  );

  // Log visitor messages first so the UI shows them even if the AI
  // call fails. Best-effort: failures are logged by the helper.
  for (const item of Array.isArray(batch) && batch.length ? batch : [{ content: parsed.message }]) {
    if (!item?.content) continue;
    await logTelegramMessage(conversation, 'visitor', item.content, {
      external_message_id: item.eventId ?? null,
      sender_id: parsed.senderId,
      sender_name: parsed.senderName,
      chat_id: parsed.chatId,
      is_group: parsed.isGroup,
    });
  }

  // Active hours check (trước khi gọi AI, sau khi đã lưu tin visitor)
  let chatbotRecord = null;
  if (idChatbot) {
    chatbotRecord = await chatbotRepository.findChatbotById(idChatbot);
  }
  const { default: chatbotActiveHoursService } = await import('../services/chatbot/chatbotActiveHours.service.js');
  const activeCheck = await chatbotActiveHoursService.checkBeforeAi({
    activeHours: chatbotRecord?.active_hours,
    channel: 'telegram_personal',
    chatbotId: idChatbot || account.id,
    senderKey: parsed.senderId,
  });
  if (!activeCheck.allowed) {
    if (activeCheck.shouldNotify) {
      await logTelegramMessage(conversation, 'bot', activeCheck.staticReply, {
        model: 'ai_outside_hours',
        replySource: 'ai_outside_hours',
      });
      try {
        await telegramAdapter.sendReply({
          userId: account.id_user,
          channelId: account.id,
          externalId: peer,
          message: activeCheck.staticReply,
        });
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

  const result = await chatRouterService.routeMessageWithSettings({
    channel: 'telegram_personal',
    userId: account.id_user,
    chatbotId: idChatbot,
    message: batchedContent,
    conversationId: conversation?.id,
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

  const replyText = result?.content;
  console.log(
    `[Telegram] AI replied: ${replyText ? replyText.length + ' chars' : '(empty)'} -> logging + sending`,
    { conversationId: conversation?.id, peer }
  );
  if (replyText) {
    await logTelegramMessage(conversation, 'bot', replyText, {
      model:
        mergedSettings.ai_model || 'gemini-2.5-flash',
    });
    console.log(`[Telegram] bot message logged, now sendReply → peer=${peer}`);
    try {
      await telegramAdapter.sendReply({
        userId: account.id_user,
        channelId: account.id,
        externalId: peer,
        message: replyText,
      });
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
function mergeAccountAndChatbotSettings(accountSettings, chatbotSettings) {
  const base = chatbotSettings || {};
  const acc = accountSettings || {};
  return {
    // AI / system config — luôn từ chatbotSettings
    id_sub_assistant: base.id_sub_assistant ?? acc.id_sub_assistant ?? null,
    sub_assistant_name: base.sub_assistant_name ?? null,
    system_instruction: base.system_instruction ?? null,
    welcome_message: base.welcome_message ?? base.greeting_msg ?? null,
    greeting_msg: base.greeting_msg ?? null,
    ai_model: base.ai_model ?? null,
    temperature: base.temperature ?? null,
    max_tokens: base.max_tokens ?? null,
    response_style: base.response_style ?? null,

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
    if (!parsed.message || !parsed.senderId) {
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
    const debounceKey = `telegram_personal:${account.id}:${parsed.chatId || parsed.senderId}`;
    inboundReplyDebounceService.enqueue({
      key: debounceKey,
      message: {
        eventId: parsed.messageId ?? null,
        content: parsed.message,
        metadata: {
          senderId: parsed.senderId,
          senderName: parsed.senderName,
          chatId: parsed.chatId,
          isGroup: parsed.isGroup,
        },
      },
      flushCallback: async (batch) => {
        await processTelegramPersonalBatch({
          account,
          parsed,
          batch,
        });
      },
    });

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
