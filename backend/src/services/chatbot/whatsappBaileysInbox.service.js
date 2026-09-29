/**
 * whatsappBaileysInbox.service.js
 *
 * Subscriber cho WhatsApp Baileys `emitter.on('message', ...)` events.
 * Khi user nhắn vào số WhatsApp đã kết nối qua QR, event được nhận ở đây:
 *   1. Persist message vào DB (chatbot_messages + chatbot_conversations)
 *   2. Lookup chatbot đang bật AI cho session này
 *   3. Route qua chatRouter → gọi adapter.sendReply (cũng qua Baileys)
 *
 * Lưu ý: khác với Zalo Personal / Cloud API, Baileys session KHÔNG có
 * `id_chatbot` cố định — 1 số WhatsApp có thể bật AI cho nhiều chatbot
 * (multi-tenant). Ta lưu mapping trong `chatbot_whatsapp_baileys_settings`.
 */
import db from '../../config/database.js';
import { listSessions as listBaileysSessions } from './whatsappBaileys.service.js';
import whatsappAdapter from './channelAdapters/whatsapp.adapter.js';
import aiCreditMeter, { VISITOR_CHAT_ERROR_MESSAGE } from '../ai/aiCreditMeter.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import chatbotContactAlertRepository from '../../repositories/chatbot/chatbotContactAlert.repository.js';
import { extractContacts } from '../../utils/contactDetect.util.js';
import { buildContactAck } from '../../utils/contactAck.util.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import subAssistantService from './subAssistant.service.js';
import ragEngineService from './ragEngine.service.js';
import businessProfileService from '../ai/businessProfile.service.js';
import chatRouterService from './chatRouter.service.js';
import { detectOffTopicReply, buildOffTopicFallback } from '../../utils/aiOffTopicReply.util.js';
import inboundReplyDebounceService from './inboundReplyDebounce.service.js';
import { formatBatchedContent } from '../../utils/chatbotReplyBatch.util.js';
import sseService from '../sse.service.js';
import unifiedInboxRepository from '../../repositories/ai/unifiedInbox.repository.js';
import { buildAiPausePayload } from '../../utils/aiHandoffResume.util.js';
import { isOwnerOutgoingEcho } from '../../utils/ownerOutgoingEcho.util.js';

const log = (...args) => console.log('[WhatsApp/Baileys/Inbox]', ...args);

const MAX_HISTORY_MESSAGES = 20;

// Tên feature ghi vào usage_logs khi trừ credit — cùng khuôn `chatbot_${channel}` của chatRouter.
const CREDIT_FEATURE = 'chatbot_whatsapp_baileys';

/**
 * Trích JID người gửi (vd "8491234567@s.whatsapp.net") từ Baileys message.
 * Khi remoteJid là @lid (LID user id), ưu tiên key.senderPn (@s.whatsapp.net)
 * vì chỉ phone JID mới cho phép reply trực tiếp tới đúng số phone người gửi.
 * LID không thể dùng để gửi đi — server WhatsApp sẽ accept nhưng không deliver
 * tới thiết bị nhận (đúng triệu chứng "Sent reply but user không nhận được").
 */
function extractSenderJid(msg) {
  const remoteJid = msg?.key?.remoteJid || msg?.key?.participant || null;
  const senderPn = msg?.key?.senderPn || null;
  if (remoteJid && remoteJid.endsWith('@lid') && senderPn) return senderPn;
  return remoteJid;
}

/**
 * Trích text từ message — chỉ xử lý các loại conversation thường gặp.
 */
function extractMessageText(msg) {
  const m = msg?.message;
  if (!m) return null;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return null;
}

/**
 * Trích message id ổn định (idempotent) để chống xử lý trùng khi Baileys
 * upsert lại cùng message nhiều lần.
 */
function extractMessageId(msg) {
  return msg?.key?.id || null;
}

/**
 * Trích tên hiển thị của sender (nếu Baileys cung cấp).
 */
function extractSenderName(msg) {
  return (
    msg?.pushName ||
    msg?.verifiedBizName ||
    msg?.message?.contact?.displayName ||
    null
  );
}

/**
 * Resolve tên hiển thị cho 1 phone JID. WhatsApp không gửi pushName cho
 * mọi message (đặc biệt với LID chat trong khi account vừa login) — vì vậy
 * tao 1 cache phone→name, lưu lại pushName mỗi khi thấy và fallback về
 * cache khi tin nhắn tiếp theo đến không kèm pushName.
 *
 * Đồng thời thử onWhatsApp(...) để lấy verifiedName / pushName server-side
 * (giới hạn ~một vài chục JID / phút).
 */
const senderNameCache = new Map(); // phoneJid -> { name, updatedAt }
const SENDER_NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function jidFromPhone(phone) {
  return `${phone}@s.whatsapp.net`;
}

function cacheName(phoneJid, name) {
  if (!phoneJid || !name) return;
  senderNameCache.set(phoneJid, { name, updatedAt: Date.now() });
}

function getCachedName(phoneJid) {
  if (!phoneJid) return null;
  const hit = senderNameCache.get(phoneJid);
  if (!hit) return null;
  if (Date.now() - hit.updatedAt > SENDER_NAME_TTL_MS) {
    senderNameCache.delete(phoneJid);
    return null;
  }
  return hit.name;
}

/**
 * Resolve tên tối ưu: pushName từ message → cache từ message trước.
 * (Trường hợp pushName=null thì fallback cache; nếu không có gì thì null —
 * ChatBot vẫn nhận message, user có thể tự set tên trong UI quản lý hội thoại.)
 */
function resolveSenderName(phone, directName) {
  if (directName) return directName;
  return getCachedName(jidFromPhone(phone));
}

/**
 * Bỏ qua tin nhóm, broadcast, status (chỉ xử lý chat 1-1; nhóm cần router riêng).
 * Tin `fromMe` KHÔNG bị bỏ ở đây nữa: tin 1-1 chủ gõ từ điện thoại đi nhánh `handleOwnerOutgoing`
 * (dừng AI), còn tin bot vừa gửi được khử echo ở đó.
 */
function shouldSkip(msg) {
  if (!msg?.key) return true;
  const jid = extractSenderJid(msg);
  if (!jid) return true;
  if (jid.endsWith('@broadcast')) return true;
  if (jid === 'status@broadcast') return true;
  if (jid.endsWith('@g.us')) return true;
  return false;
}

/**
 * Lookup chatbot đang bật AI cho session này. Một Baileys session có thể
 * được bật cho nhiều chatbot — trả về danh sách.
 *
 * Bug 22/09 (Zalo parity): SELECT thêm `cb.system_instruction` từ
 * `custom_chatbots` và COALESCE fallback chain giống Zalo:
 *   1. `s.system_instruction`  — user cấu hình riêng cho WhatsApp session
 *   2. `cb.system_instruction` — từ chatbot gốc (Studio)
 *
 * Trước fix: chỉ lấy `s.system_instruction` → nếu row trống (user chưa
 * lưu WhatsApp-specific) → AI không thấy instruction nào.
 */
async function findEnabledChatbots(sessionKey) {
  const { rows } = await db.query(
    `SELECT s.id_chatbot,
            -- Bug 22/09: COALESCE fallback chain giống Zalo.
            COALESCE(
              NULLIF(BTRIM(s.system_instruction), ''),
              NULLIF(BTRIM(cb.system_instruction), '')
            ) AS system_instruction,
            s.welcome_message, s.ai_model, s.temperature,
            s.max_tokens, s.response_style,
            s.id_sub_assistant, sa.name AS sub_assistant_name,
            cb.id_user, cb.name AS chatbot_name,
            cb.active_hours, cb.replies_enabled
     FROM chatbot_whatsapp_baileys_settings s
     JOIN custom_chatbots cb ON cb.id = s.id_chatbot
     LEFT JOIN sub_assistants sa ON sa.id = s.id_sub_assistant
     WHERE s.session_key = $1 AND s.is_enabled = true AND cb.is_active = true`,
    [sessionKey]
  );
  return rows;
}

/**
 * Lấy / tạo channel_connections row cho Baileys session (cần vì
 * channel_conversations.id_channel là NOT NULL). Row này chỉ mang tính
 * referential — không phải Cloud API webhook.
 *
 * @param {string} sessionKey - vd "3-default"
 * @returns {Promise<{id: number}>}
 */
async function getOrCreateBaileysChannelConnection(sessionKey) {
  // Dùng external_channel_id làm unique key thay vì webhook_token
  // (webhook_token column nullable, không có unique constraint).
  const { rows: existing } = await db.query(
    `SELECT id FROM channel_connections
     WHERE channel = 'whatsapp_baileys' AND external_channel_id = $1 LIMIT 1`,
    [sessionKey]
  );
  if (existing[0]) return existing[0];

  const ownerUserId = parseInt(sessionKey.split('-')[0], 10);
  const { rows: created } = await db.query(
    `INSERT INTO channel_connections
       (id_user, channel, external_channel_id, display_name, is_active, settings)
     VALUES ($1, 'whatsapp_baileys', $2, $3, true, '{}'::jsonb)
     RETURNING id`,
    [ownerUserId, sessionKey, `WhatsApp Baileys ${sessionKey}`]
  );
  return created[0];
}

/**
 * Lấy / tạo conversation cho Baileys session — dùng bảng
 * `channel_conversations`. Phân biệt nhiều chatbot qua composite
 * external_id: `baileys:<sessionKey>:<chatbotId>:<externalPhone>`.
 *
 * @param {object} params
 * @param {string} params.sessionKey
 * @param {number} params.ownerUserId
 * @param {string} params.externalPhone
 * @param {string} params.visitorName
 * @param {number} params.idChatbot
 * @param {number} params.idChannelConnection - FK sang channel_connections.id
 * @returns {Promise<{id: number}>}
 */
async function getOrCreateConversation({ sessionKey, ownerUserId, externalPhone, visitorName, idChatbot, idChannelConnection }) {
  const compositeExternalId = `baileys:${sessionKey}:${idChatbot}:${externalPhone}`;
  const { rows: existing } = await db.query(
    `SELECT id FROM channel_conversations
     WHERE id_user = $1 AND channel = 'whatsapp_baileys' AND external_id = $2
     ORDER BY id DESC LIMIT 1`,
    [ownerUserId, compositeExternalId]
  );
  if (existing[0]) return existing[0];
  const { rows: created } = await db.query(
    `INSERT INTO channel_conversations
       (id_user, id_channel, channel, external_id, visitor_name, visitor_info)
     VALUES ($1, $2, 'whatsapp_baileys', $3, $4, $5)
     RETURNING id`,
    [ownerUserId, idChannelConnection, compositeExternalId, visitorName || null, JSON.stringify({ chatbot_id: idChatbot })]
  );
  return created[0];
}

/**
 * Lưu tin nhắn vào channel_messages.
 * Dùng ON CONFLICT DO NOTHING dựa trên unique index
 * uniq_chatbot_message_conversation_external (nếu có) để chống Baileys
 * upsert trùng message.
 */
async function persistMessage({ conversationId, channelId, userId, role, content, externalId, externalMessageId, metadata }) {
  const externalRef = externalId || externalMessageId || null;
  // channel_messages không có unique index trên (conversation, external_id)
  // nên dùng cách check trước để idempotent:
  if (externalRef) {
    const { rows: dup } = await db.query(
      `SELECT id FROM channel_messages
       WHERE id_conversation = $1 AND external_id = $2 LIMIT 1`,
      [conversationId, externalRef]
    );
    if (dup[0]) return { ...dup[0], duplicate: true };
  }
  const { rows } = await db.query(
    `INSERT INTO channel_messages
       (id_conversation, id_user, id_channel, role, content, message_type,
        external_id, external_ts, attachments, metadata, raw_data)
     VALUES ($1, $2, $3, $4, $5, 'text', $6, NOW(), '[]'::jsonb, $7::jsonb, '{}'::jsonb)
     RETURNING id`,
    [conversationId, userId, channelId, role, content, externalRef, JSON.stringify(metadata || {})]
  );
  return rows[0];
}

/**
 * Ghi id tin WhatsApp vừa gửi vào dòng bot đã lưu — để khi WhatsApp đẩy lại tin đó (fromMe) ta nhận
 * ra là echo (khuôn Zalo `bindZaloPersonalOutboundMsgIds`). Best-effort.
 */
async function bindBotExternalId(rowId, messageId) {
  if (!rowId || !messageId) return;
  try {
    await db.query(
      `UPDATE channel_messages SET external_id = $2 WHERE id = $1 AND external_id IS NULL`,
      [rowId, String(messageId)]
    );
  } catch (err) {
    log('bindBotExternalId failed:', err.message);
  }
}

/**
 * Chủ đang tạm dừng AI cho hội thoại này? Dùng chung `isAiPaused` của Hộp thư: TỰ BẬT LẠI khi
 * quá `ai_handoff_auto_resume_minutes` (đọc cờ thô thì tạm dừng kẹt vĩnh viễn).
 */
async function isConversationAiPaused(conversationId) {
  return unifiedInboxRepository.isAiPaused(conversationId, 'channel');
}

/**
 * Chủ tự gõ từ điện thoại tới khách 1-1 → dừng AI cho MỌI hội thoại của (sessionKey, phone)
 * (nhiều chatbot = nhiều dòng), ghi dòng `agent` + SSE. Echo của tin bot/Hộp thư vừa gửi → bỏ.
 * Echo quyết định trên TOÀN BỘ hội thoại của số đó: tin bot nằm ở hội thoại của MỘT chatbot,
 * không được dừng nhầm hội thoại của chatbot còn lại.
 */
async function handleOwnerOutgoing({ sessionKey, msg, type }) {
  // 'append' = tin do chính socket này gửi (echo `emitOwnEvents`) hoặc tin cũ giao lúc offline.
  // Chủ gõ trực tiếp lúc socket online về dạng 'notify'.
  if (type === 'append') {
    log(`[owner-outgoing] skipped session=${sessionKey} reason=append`);
    return;
  }
  if (shouldSkip(msg)) return;
  const jid = extractSenderJid(msg);
  const text = extractMessageText(msg);
  const waMessageId = extractMessageId(msg);
  if (!jid || !text) return;
  const phone = jid.split('@')[0];
  const ownerUserId = parseInt(sessionKey.split('-')[0], 10);
  if (!Number.isFinite(ownerUserId)) return;

  const { rows: conversations } = await db.query(
    `SELECT id, id_channel, visitor_name FROM channel_conversations
     WHERE id_user = $1 AND channel = 'whatsapp_baileys'
       AND starts_with(external_id, $2)
       AND right(external_id, length($3)) = $3`,
    [ownerUserId, `baileys:${sessionKey}:`, `:${phone}`]
  );
  if (!conversations.length) return;

  const candidates = [];
  for (const conv of conversations) {
    const { rows } = await db.query(
      `SELECT external_id, content, created_at FROM channel_messages
       WHERE id_conversation = $1 AND role IN ('bot', 'agent')
         AND created_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY id DESC LIMIT 40`,
      [conv.id]
    );
    for (const r of rows || []) {
      candidates.push({ externalId: r.external_id, content: r.content, createdAt: r.created_at });
    }
  }
  if (isOwnerOutgoingEcho({ incomingId: waMessageId, incomingContent: text, candidates })) {
    log(`[owner-outgoing] echo skipped session=${sessionKey} msgId=${waMessageId}`);
    return;
  }

  for (const conv of conversations) {
    await persistMessage({
      conversationId: conv.id,
      channelId: conv.id_channel,
      userId: ownerUserId,
      role: 'agent',
      content: text,
      externalMessageId: waMessageId,
      metadata: { source: 'owner_phone' },
    });
    const pausedRow = await unifiedInboxRepository.setAiPaused(conv.id, 'channel', true, 'handoff');
    const pauseState = await buildAiPausePayload({
      aiPaused: pausedRow.aiPaused,
      aiPausedAt: pausedRow.aiPausedAt,
      ownerUserId,
    });
    sseService.broadcast(String(ownerUserId), 'inbox:new_message', {
      conversationId: conv.id,
      conversationType: 'channel',
      type: 'channel',
      channel: 'whatsapp_baileys',
      message: text,
      senderName: null,
      visitorName: conv.visitor_name || null,
      role: 'agent',
      isSelf: true,
      timestamp: new Date().toISOString(),
      ...pauseState,
    });
    log(`[owner-outgoing] session=${sessionKey} conversation=${conv.id} owner replied from phone → AI paused`);
  }
}

/**
 * Lấy lịch sử hội thoại.
 * @param {number} conversationId
 * @param {object} options
 * @param {number} [options.throughMessageId] - chỉ lấy tin có id <= this
 * @param {number[]} [options.excludeMessageIds] - loại trừ các message IDs này
 * @param {number} [options.limit=20]
 */
async function getHistory(conversationId, options = {}) {
  const { throughMessageId = null, excludeMessageIds = [], limit = MAX_HISTORY_MESSAGES } = options;
  let query = `SELECT id, role, content FROM channel_messages
     WHERE id_conversation = $1`;
  const params = [conversationId];

  if (throughMessageId) {
    params.push(throughMessageId);
    query += ` AND id <= $${params.length}`;
  }
  const excluded = Array.isArray(excludeMessageIds)
    ? excludeMessageIds.map(Number).filter(Number.isInteger)
    : [];
  if (excluded.length > 0) {
    params.push(excluded);
    query += ` AND id NOT IN ($${params.length})`;
  }

  params.push(limit);
  query += ` ORDER BY id ASC LIMIT $${params.length}`;

  const { rows } = await db.query(query, params);
  return rows;
}

/**
 * Gọi AI (Gemini) và gửi reply cho visitor.
 * Dùng chung `chatRouterService._callAI` / `.buildSystemPrompt` để:
 *   - Đồng bộ prompt + rule anti-hallucination ("không tự nhận là WhatsApp") với các kênh khác
 *   - Được retry thinkingBudget cho Gemini 2.5 + timeout 30s (chatRouter có, bản cũ thiếu)
 *   - Tái sử dụng 1 code path duy nhất → dễ bảo trì
 */
async function buildReplyForChatbot({ ownerUserId, cb, history, messageText }) {
  const subAssistant = cb.id_sub_assistant
    ? await subAssistantService.getById(cb.id_sub_assistant, ownerUserId)
    : null;
  const profileContext = await businessProfileService
    .getFormattedProfileForPrompt(ownerUserId)
    .catch(() => '');
  const ragContext = await ragEngineService
    .buildContext(ownerUserId, messageText, { customChatbotId: cb.id_chatbot })
    .catch(() => '');
  const isFirstMessage = history.length === 0;

  const systemPrompt = chatRouterService.buildSystemPrompt({
    subAssistant,
    // Trước đây chỗ này chỉ pass welcome_message + response_style +
    // system_instruction — thiếu `sub_assistant_name`. Khi user attach
    // sub-assistant cho WhatsApp Baileys session thì buildSystemPrompt
    // resolve `name = subAssistant?.name || settings?.sub_assistant_name
    // || chatbot?.name`. Nếu subAssistant=null (vd ID set trong DB
    // nhưng row không tồn tại / bị xoá) thì rơi về `cb.chatbot_name`
    // (generic, vd "Tro ly AI") → AI xưng hô "Anh/Chị" thay vì tên
    // đặt trong sub-assistant. JOIN `sa.name` ngay trong
    // findEnabledChatbots → pass thẳng qua đây để prompt dùng đúng tên.
    settings: {
      welcome_message: cb.welcome_message,
      response_style: cb.response_style,
      system_instruction: cb.system_instruction,
      sub_assistant_name: cb.sub_assistant_name,
    },
    chatbot: { name: cb.chatbot_name },
    ragContext,
    profileContext,
    isFirstMessage,
  });

  // _callAI trả { text } (không phải string thuần) — unwrap tại đây.
  const { text: reply } = await chatRouterService._callAI({
    userId: ownerUserId,
    systemPrompt,
    history,
    message: messageText,
    model: cb.ai_model || 'gemini-2.5-flash',
    temperature: parseFloat(cb.temperature || 0.7),
    maxTokens: cb.max_tokens || 2048,
  });
  return reply || '';
}

/**
 * Resolve chatbot settings cho WhatsApp (cần gọi mỗi batch vì AI settings có thể thay đổi).
 */
async function resolveChatbotSettingsForBatch({ ownerUserId, sessionKey, chatbotId }) {
  const { rows } = await db.query(
    `SELECT s.id_chatbot,
            COALESCE(
              NULLIF(BTRIM(s.system_instruction), ''),
              NULLIF(BTRIM(cb.system_instruction), '')
            ) AS system_instruction,
            s.welcome_message, s.ai_model, s.temperature,
            s.max_tokens, s.response_style,
            s.id_sub_assistant, sa.name AS sub_assistant_name,
            cb.id_user, cb.name AS chatbot_name,
            cb.active_hours, cb.replies_enabled
     FROM chatbot_whatsapp_baileys_settings s
     JOIN custom_chatbots cb ON cb.id = s.id_chatbot
     LEFT JOIN sub_assistants sa ON sa.id = s.id_sub_assistant
     WHERE s.session_key = $1 AND s.id_chatbot = $2 AND s.is_enabled = true AND cb.is_active = true`,
    [sessionKey, chatbotId]
  );
  return rows[0] || null;
}

/**
 * Xử lý 1 inbound message từ Baileys — persist và enqueue vào debounce bucket.
 */
async function processIncomingMessage({ sessionKey, msg, type }) {
  log(`[incoming] session=${sessionKey} raw=${JSON.stringify({ key: msg?.key, hasMsg: !!msg?.message }).slice(0, 200)}`);
  try {
    if (msg?.key?.fromMe === true) {
      await handleOwnerOutgoing({ sessionKey, msg, type });
      return;
    }
    if (shouldSkip(msg)) {
      log(`[incoming] skipped session=${sessionKey} reason=shouldSkip`);
      return;
    }
    const senderJid = extractSenderJid(msg);
    const messageText = extractMessageText(msg);
    const messageId = extractMessageId(msg);
    log(`[incoming] parsed session=${sessionKey} jid=${senderJid} text="${(messageText || '').slice(0, 80)}" msgId=${messageId}`);
    if (!messageText || !senderJid) {
      log(`[incoming] skipped session=${sessionKey} reason=emptyTextOrJid`);
      return;
    }

    // Số điện thoại thuần (bỏ @s.whatsapp.net).
    const externalId = senderJid.split('@')[0];
    const directName = extractSenderName(msg);
    // Lưu pushName vào cache ngay khi có để các message sau không có pushName
    // vẫn lấy được tên.
    if (directName) cacheName(jidFromPhone(externalId), directName);
    // Resolve tên: 1. pushName trực tiếp, 2. cache từ lần trước.
    const senderName = resolveSenderName(externalId, directName);

    // Owner = userId từ session_key prefix.
    const ownerUserId = parseInt(sessionKey.split('-')[0], 10);
    if (!Number.isFinite(ownerUserId)) return;

    // Lookup chatbots đang bật AI cho session này.
    const enabledChatbots = await findEnabledChatbots(sessionKey);
    log(`session=${sessionKey} enabledChatbots=${enabledChatbots.length} ids=[${enabledChatbots.map((c) => c.id_chatbot).join(',')}]`);
    if (enabledChatbots.length === 0) {
      log(`session=${sessionKey} has no enabled chatbot — skipping`);
      return;
    }

    // Channel connection row (FK cần cho channel_messages + channel_conversations).
    const channelConn = await getOrCreateBaileysChannelConnection(sessionKey);
    const idChannelConnection = channelConn.id;

    // Với mỗi chatbot bật AI, đảm bảo có conversation và enqueue message.
    for (const cb of enabledChatbots) {
      const conversation = await getOrCreateConversation({
        sessionKey,
        ownerUserId,
        externalPhone: externalId,
        visitorName: senderName,
        idChatbot: cb.id_chatbot,
        idChannelConnection,
      });

      // Lưu tin khách TRƯỚC khi kiểm tạm dừng: chủ đang trả lời tay vẫn phải thấy tin khách trong Hộp thư.
      // Persist visitor message (idempotent nhờ messageId nếu có).
      const persistResult = await persistMessage({
        conversationId: conversation.id,
        channelId: idChannelConnection,
        userId: ownerUserId,
        role: 'visitor',
        content: messageText,
        externalMessageId: messageId,
      });

      // Hộp thư tự cập nhật khi khách nhắn (khuôn zaloInbox) — FE đọc conversationId/type/channel/message.
      if (!persistResult?.duplicate) {
        sseService.broadcast(String(ownerUserId), 'inbox:new_message', {
          conversationId: conversation.id,
          conversationType: 'channel',
          type: 'channel',
          channel: 'whatsapp_baileys',
          message: messageText,
          senderId: externalId,
          senderName: senderName || null,
          visitorName: senderName || null,
          role: 'visitor',
          timestamp: new Date().toISOString(),
        });
      }

      // Tạm dừng (chủ đang trả lời tay) — có tự bật lại theo ai_handoff_auto_resume_minutes.
      if (await isConversationAiPaused(conversation.id)) {
        log(`session=${sessionKey} conversation=${conversation.id} AI paused — tin khách đã lưu, không gọi AI`);
        continue;
      }

      // Active hours check
      const { default: chatbotActiveHoursService } = await import('./chatbotActiveHours.service.js');
      const activeCheck = await chatbotActiveHoursService.checkBeforeAi({
        activeHours: cb.active_hours,
        repliesEnabled: cb.replies_enabled,
        channel: 'whatsapp_baileys',
        chatbotId: cb.id_chatbot,
        senderKey: externalId,
      });
      if (!activeCheck.allowed) {
        if (activeCheck.shouldNotify) {
          const sent = await whatsappAdapter.sendReply({
            channelId: sessionKey,
            externalId,
            message: activeCheck.staticReply,
          });
          if (sent?.success !== false) {
            await persistMessage({
              conversationId: conversation.id,
              channelId: idChannelConnection,
              userId: ownerUserId,
              role: 'bot',
              content: activeCheck.staticReply,
              externalId: sent?.messageId,
            });
            await chatbotActiveHoursService.markNotified({
              channel: 'whatsapp_baileys',
              chatbotId: cb.id_chatbot,
              senderKey: externalId,
              activeHours: cb.active_hours,
            });
          }
        }
        log(`session=${sessionKey} chatbot=${cb.id_chatbot} outside active hours — message saved, no AI reply`);
        continue;
      }

      // Enqueue vào debounce bucket để gom tin nhắn
      const debounceKey = `whatsapp_baileys:${sessionKey}:${conversation.id}`;
      inboundReplyDebounceService.enqueue({
        key: debounceKey,
        message: {
          eventId: messageId || null,
          persistedMessageId: persistResult?.id || null,
          receivedAt: Date.now(),
          content: messageText,
          metadata: {
            ownerUserId,
            sessionKey,
            chatbotId: cb.id_chatbot,
            conversationId: conversation.id,
            idChannelConnection,
            externalId,
            senderName,
          },
        },
        flushCallback: async (batch) => {
          await _processWhatsAppBaileysBatch({
            batch,
          });
        },
      });
    }
  } catch (err) {
    log('processIncomingMessage error:', err.stack || err.message);
  }
}

/**
 * Xử lý batch đã gom — gọi AI một lần cho tất cả tin nhắn.
 */
async function _processWhatsAppBaileysBatch({ batch }) {
  if (!batch.messages.length) return;

  const prompt = formatBatchedContent(batch.messages);
  if (!prompt) return;

  // Lấy metadata từ tin nhắn đầu tiên (tất cả cùng conversation)
  const firstMeta = batch.messages[0]?.metadata || {};
  const {
    ownerUserId,
    sessionKey,
    chatbotId,
    conversationId,
    idChannelConnection,
    externalId,
    senderName,
  } = firstMeta;

  log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason}`);

  try {
    // Resolve chatbot settings (có thể thay đổi giữa các batch)
    const cb = await resolveChatbotSettingsForBatch({ ownerUserId, sessionKey, chatbotId });
    if (!cb) {
      log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} chatbot=${chatbotId} result=disabled`);
      return;
    }

    // Khoá tài nguyên (hạ gói / hết hạn): chatbot bị khoá thì không gọi AI (tin khách đã lưu).
    const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('chatbots', cb.id_chatbot)) {
      log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} chatbot=${cb.id_chatbot} conversation=${conversationId} result=locked`);
      return;
    }

    // Trần lượt trả lời — đếm MỖI ĐỢT GOM một lần (khuôn zaloInbox.service.js).
    const { default: chatbotRateLimitService } = await import('./chatbotRateLimit.service.js');
    const rate = await chatbotRateLimitService.checkBeforeAi({
      channel: 'whatsapp_baileys',
      ownerUserId,
      chatbotId: cb.id_chatbot,
      senderKey: externalId,
    });
    if (!rate.allowed) {
      if (rate.shouldNotify) {
        const sent = await whatsappAdapter.sendReply({
          channelId: sessionKey,
          externalId,
          message: rate.staticReply,
        });
        if (sent?.success !== false) {
          await persistMessage({
            conversationId,
            channelId: idChannelConnection,
            userId: ownerUserId,
            role: 'bot',
            content: rate.staticReply,
            externalId: sent?.messageId,
          });
          await chatbotRateLimitService.markRateLimitNotified({
            channel: 'whatsapp_baileys',
            ownerUserId,
            chatbotId: cb.id_chatbot,
            senderKey: externalId,
            reason: rate.reason,
          });
        }
      }
      log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} chatbot=${cb.id_chatbot} conversation=${conversationId} result=rate_limited`);
      return;
    }

    // Lấy lịch sử hội thoại (chỉ tin TRƯỚC batch này, không lấy 20 tin gần nhất).
    // throughMessageId đảm bảo AI chỉ thấy tin trước khi visitor nhắn batch này.
    // excludeMessageIds loại trừ visitor messages trong batch để tránh thấy lặp.
    const visitorMessageIds = batch.messages
      .map((m) => m.persistedMessageId)
      .filter((id) => id != null);
    const throughMessageId = visitorMessageIds.length > 0
      ? Math.min(...visitorMessageIds)
      : null;
    const history = await getHistory(conversationId, {
      throughMessageId,
      excludeMessageIds: visitorMessageIds,
    });

    // Hai số này chỉ có sau khi dựng xong history — log ở đầu hàm là ReferenceError,
    // ném ngay trước try nên mọi lượt gom tin WhatsApp chết im lặng.
    log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} history_size=${history.length} throughMessageId=${throughMessageId}`);

    // Hạn mức credit AI của chủ: hết credit thì gửi câu báo cho khách, KHÔNG gọi AI.
    const creditPrep = await chatRouterService._prepareChatCredit(ownerUserId, CREDIT_FEATURE);
    if (creditPrep.visitorMessage) {
      const creditRow = await persistMessage({
        conversationId,
        channelId: idChannelConnection,
        userId: ownerUserId,
        role: 'bot',
        content: creditPrep.visitorMessage,
      });
      const creditSent = await whatsappAdapter.sendReply({
        channelId: sessionKey,
        externalId,
        message: creditPrep.visitorMessage,
      });
      await bindBotExternalId(creditRow?.id, creditSent?.messageId);
      log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} result=out_of_credit`);
      return;
    }

    // Gọi AI với prompt từ batched messages
    const subAssistant = cb.id_sub_assistant
      ? await subAssistantService.getById(cb.id_sub_assistant, ownerUserId)
      : null;
    const profileContext = await businessProfileService
      .getFormattedProfileForPrompt(ownerUserId)
      .catch(() => '');
    const ragContext = await ragEngineService
      .buildContext(ownerUserId, prompt, { customChatbotId: cb.id_chatbot })
      .catch(() => '');
    const isFirstMessage = history.length === 0;

    // Khách để lại SĐT/email → lời xác nhận (khuôn chatRouter.routeMessageWithSettings).
    const extractedContacts = extractContacts(prompt);
    let contactAck = null;
    if (extractedContacts.length > 0) {
      const ownerContact = await chatbotContactAlertRepository.getOwnerContact(ownerUserId);
      contactAck = buildContactAck(extractedContacts, ownerContact);
    }

    const systemPrompt = chatRouterService.buildSystemPrompt({
      subAssistant,
      settings: {
        welcome_message: cb.welcome_message,
        response_style: cb.response_style,
        system_instruction: cb.system_instruction,
        sub_assistant_name: cb.sub_assistant_name,
      },
      chatbot: { name: cb.chatbot_name },
      ragContext,
      profileContext,
      isFirstMessage,
      contactNote: contactAck?.note || null,
    });

    let reply;
    try {
      ({ text: reply } = await chatRouterService._callAI({
        userId: ownerUserId,
        systemPrompt,
        history,
        message: prompt,
        model: cb.ai_model || 'gemini-2.5-flash',
        temperature: parseFloat(cb.temperature || 0.7),
        maxTokens: cb.max_tokens || 2048,
      }));
    } catch (aiError) {
      if (aiUsageMeter.isLimitError(aiError) || aiCreditMeter.isLimitError(aiError)) {
        // Chạm giới hạn giữa chừng: báo khách, KHÔNG trừ credit.
        log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} result=ai_limit error=${aiError.message}`);
        const limitRow = await persistMessage({
          conversationId,
          channelId: idChannelConnection,
          userId: ownerUserId,
          role: 'bot',
          content: VISITOR_CHAT_ERROR_MESSAGE,
        });
        const limitSent = await whatsappAdapter.sendReply({
          channelId: sessionKey,
          externalId,
          message: VISITOR_CHAT_ERROR_MESSAGE,
        });
        await bindBotExternalId(limitRow?.id, limitSent?.messageId);
        return;
      }
      throw aiError;
    }

    // AI trả lời được → trừ 1 credit (giống các kênh khác).
    await chatRouterService._chargeChatCredit(ownerUserId, CREDIT_FEATURE, creditPrep.creditContext);

    let cleanReply = stripMarkdown(reply || '');

    // Safety net: detect off-topic
    const offTopicCheck = detectOffTopicReply({
      customerMessage: prompt,
      aiReply: cleanReply,
    });
    if (offTopicCheck.isOffTopic) {
      log(`[off-topic] whatsapp_baileys chatbot=${chatbotId} session=${sessionKey} reason=${offTopicCheck.reason}`);
      cleanReply = buildOffTopicFallback({
        assistantName: cb.sub_assistant_name || cb.chatbot_name || null,
        customerMessage: prompt,
      });
    }

    if (contactAck?.footer) {
      cleanReply = `${cleanReply.trim()}\n\n${contactAck.footer}`;
    }

    // Persist bot reply
    const botRow = await persistMessage({
      conversationId,
      channelId: idChannelConnection,
      userId: ownerUserId,
      role: 'bot',
      content: cleanReply,
    });

    // Gửi qua WhatsApp
    const sentReply = await whatsappAdapter.sendReply({
      channelId: sessionKey,
      externalId,
      message: cleanReply,
    });
    await bindBotExternalId(botRow?.id, sentReply?.messageId);

    log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} batch_size=${batch.messages.length} result=sent`);
  } catch (err) {
    log(`[ChatbotDebounce] channel=whatsapp_baileys session=${sessionKey} conversation=${conversationId} result=failed error=${err.message}`);
    try {
      await whatsappAdapter.sendReply({
        channelId: sessionKey,
        externalId,
        message: VISITOR_CHAT_ERROR_MESSAGE,
      });
    } catch (_) { /* noop */ }
  }
}

/**
 * Đăng ký subscriber cho tất cả Baileys sessions đang active.
 * Được gọi 1 lần khi server khởi động và sau mỗi lần connectSession mới.
 */
export function registerSessionHandlers(sessionKey) {
  const all = listBaileysSessions();
  const rec = all.find((s) => s.sessionKey === sessionKey);
  if (!rec || !rec.emitter) return;
  // Tránh đăng ký trùng.
  if (rec.emitter.__baileysInboxRegistered === sessionKey) return;
  rec.emitter.__baileysInboxRegistered = sessionKey;

  rec.emitter.on('message', (payload) => {
    if (payload?.sessionKey !== sessionKey) return;
    processIncomingMessage({
      sessionKey,
      msg: payload.message,
      type: payload.type,
    });
  });
  log(`Subscribed message handler for session=${sessionKey}`);
}

/**
 * Đăng ký cho tất cả sessions hiện có (gọi khi server start).
 */
export function registerAllSessionHandlers() {
  const all = listBaileysSessions();
  for (const rec of all) {
    if (rec.sessionKey) registerSessionHandlers(rec.sessionKey);
  }
  log(`Subscribed handlers for ${all.length} session(s)`);
}
