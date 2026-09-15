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
 */
async function processTelegramPersonalBatch({ account, parsed, batch }) {
  const peer = parsed.chatId || parsed.senderId;
  const conversation = await getOrCreateTelegramConversation(
    account,
    peer,
    parsed.senderName
  );

  const idChatbot = conversation.id_chatbot;

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

  if (!accountSettings?.is_enabled) {
    console.log(
      '[Telegram] batch skip: accountSettings.is_enabled=false',
      { accountId: account.id, idChatbot, hasAccountSettings: !!accountSettings }
    );
    return;
  }
  if (parsed.isGroup && !accountSettings.is_enabled_group) {
    console.log('[Telegram] batch skip: group disabled', { accountId: account.id });
    return;
  }
  if (!parsed.isGroup && !accountSettings.is_enabled_dm) {
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
    chatbotSettings: accountSettings || chatbotSettings || {},
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
        accountSettings?.ai_model || chatbotSettings?.ai_model || 'gemini-2.5-flash',
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
    const debounceKey = `telegram_personal:${account.id}:${parsed.chatId || parsed.senderId}`;
    inboundReplyDebounceService.enqueue({
      key: debounceKey,
      message: {
        eventId: req.body?.message_id ?? null,
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
