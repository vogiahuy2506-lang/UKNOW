/**
 * internal.routes.js
 *
 * Routes used by sibling services running inside the same trust boundary
 * (e.g. the Python `telegram-gateway`). They authenticate with a
 * shared secret rather than the user JWT — no UKNOW user is logged in.
 */
import express from 'express';
import db from '../config/database.js';
import telegramAdapter from '../services/chatbot/channelAdapters/telegram.adapter.js';
import chatbotTelegramRepository from '../repositories/chatbot/chatbotTelegram.repository.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import inboundReplyDebounceService from '../services/chatbot/inboundReplyDebounce.service.js';

const router = express.Router();

function requireGatewaySecret(req, res, next) {
  try {
    telegramAdapter.verifyWebhookSecret(req.headers['x-gateway-secret']);
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: err.message });
  }
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
      return res.status(204).end();
    }

    const telegramUserId = parsed.telegramUserId;
    if (!telegramUserId) {
      return res.status(204).end();
    }

    const account = await chatbotTelegramRepository.getAccountByTelegramUserId(telegramUserId);
    if (!account || !account.is_active) {
      return res.status(204).end();
    }

    // Debounce so a fast burst of messages gets one AI call.
    const peer = parsed.chatId || parsed.senderId;
    const debounceKey = `telegram_personal:${account.id}:${peer}`;
    const debounced = inboundReplyDebounceService.shouldProcess(debounceKey);
    if (!debounced.shouldProcess) {
      return res.status(204).end();
    }

    const conversation = await getOrCreateTelegramConversation(
      account,
      peer,
      parsed.senderName
    );

    const idChatbot = conversation.id_chatbot;

    // Resolve AI settings: prefer the per-(account, chatbot) row, fall
    // back to the channel-level settings so legacy setups still work.
    const chatbotSettings = await chatbotRepository.getSettings(account.id_user, 'telegram_personal');
    let accountSettings = null;
    if (idChatbot) {
      const { rows } = await db.query(
        `SELECT * FROM telegram_chatbot_settings
         WHERE id_telegram_account = $1 AND id_chatbot = $2`,
        [account.id, idChatbot]
      );
      accountSettings = rows[0] || null;
    }

    if (!accountSettings?.is_enabled) {
      return res.status(204).end();
    }

    // Honor the DM-vs-group toggle.
    if (parsed.isGroup && !accountSettings.is_enabled_group) {
      return res.status(204).end();
    }
    if (!parsed.isGroup && !accountSettings.is_enabled_dm) {
      return res.status(204).end();
    }

    // Honor owner handoff (paused AI).
    if (await isTelegramAiPaused(conversation?.id)) {
      return res.status(204).end();
    }

    // Log the visitor message before/after running AI — best-effort.
    await logTelegramMessage(conversation, 'visitor', parsed.message, {
      external_message_id: req.body?.message_id || null,
      sender_id: parsed.senderId,
      sender_name: parsed.senderName,
      chat_id: parsed.chatId,
      is_group: parsed.isGroup,
    });

    // Run the AI pipeline through the unified router.
    const result = await chatRouterService.routeMessageWithSettings({
      channel: 'telegram_personal',
      userId: account.id_user,
      chatbotId: idChatbot,
      message: parsed.message,
      conversationId: conversation?.id,
      chatbotSettings: accountSettings || chatbotSettings || {},
      visitorInfo: {
        source: 'telegram_personal',
        telegram_account_id: account.id,
        telegram_user_id: telegramUserId,
        sender_id: parsed.senderId,
        sender_name: parsed.senderName,
        chat_id: parsed.chatId,
        is_group: parsed.isGroup,
      },
    });

    const replyText = result?.content;
    if (replyText) {
      await logTelegramMessage(conversation, 'bot', replyText, {
        model: accountSettings?.ai_model || chatbotSettings?.ai_model || 'gemini-2.5-flash',
      });
      try {
        await telegramAdapter.sendReply({
          userId: account.id_user,
          channelId: account.id,
          externalId: peer,
          message: replyText,
        });
      } catch (sendErr) {
        console.warn('[Telegram] sendReply failed:', sendErr.message);
      }
    }

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
 */
router.get('/telegram-health', requireGatewaySecret, (req, res) => {
  return res.json({ status: 'ok' });
});

export default router;
