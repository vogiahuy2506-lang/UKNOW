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
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { VISITOR_CHAT_ERROR_MESSAGE } from '../ai/aiCreditMeter.service.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import { extractGeminiUsage, joinGeminiTextParts } from '../../utils/geminiClient.util.js';
import subAssistantService from './subAssistant.service.js';
import ragEngineService from './ragEngine.service.js';
import businessProfileService from '../ai/businessProfile.service.js';

const log = (...args) => console.log('[WhatsApp/Baileys/Inbox]', ...args);

const MAX_HISTORY_MESSAGES = 20;

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
 * Bỏ qua tin nhắn từ chính mình (echo), tin nhắn từ group broadcast, status.
 */
function shouldSkip(msg) {
  if (!msg?.key) return true;
  if (msg.key.fromMe === true) return true;
  const jid = extractSenderJid(msg);
  if (!jid) return true;
  if (jid.endsWith('@broadcast')) return true;
  if (jid === 'status@broadcast') return true;
  // Chỉ xử lý 1-1 chat; group cần router riêng (Zalo có sẵn flow).
  if (jid.endsWith('@g.us')) return true;
  return false;
}

/**
 * Lookup chatbot đang bật AI cho session này. Một Baileys session có thể
 * được bật cho nhiều chatbot — trả về danh sách.
 */
async function findEnabledChatbots(sessionKey) {
  const { rows } = await db.query(
    `SELECT s.id_chatbot, s.welcome_message, s.ai_model, s.temperature,
            s.max_tokens, s.response_style, s.system_instruction,
            s.id_sub_assistant, cb.id_user, cb.name AS chatbot_name
     FROM chatbot_whatsapp_baileys_settings s
     JOIN custom_chatbots cb ON cb.id = s.id_chatbot
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
async function persistMessage({ conversationId, channelId, userId, role, content, externalId, externalMessageId }) {
  const externalRef = externalId || externalMessageId || null;
  // channel_messages không có unique index trên (conversation, external_id)
  // nên dùng cách check trước để idempotent:
  if (externalRef) {
    const { rows: dup } = await db.query(
      `SELECT id FROM channel_messages
       WHERE id_conversation = $1 AND external_id = $2 LIMIT 1`,
      [conversationId, externalRef]
    );
    if (dup[0]) return dup[0];
  }
  const { rows } = await db.query(
    `INSERT INTO channel_messages
       (id_conversation, id_user, id_channel, role, content, message_type,
        external_id, external_ts, attachments, metadata, raw_data)
     VALUES ($1, $2, $3, $4, $5, 'text', $6, NOW(), '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [conversationId, userId, channelId, role, content, externalRef]
  );
  return rows[0];
}

/**
 * Lấy lịch sử hội thoại (giới hạn MAX_HISTORY_MESSAGES).
 */
async function getHistory(conversationId) {
  const { rows } = await db.query(
    `SELECT role, content FROM channel_messages
     WHERE id_conversation = $1
     ORDER BY id DESC LIMIT $2`,
    [conversationId, MAX_HISTORY_MESSAGES]
  );
  return rows.reverse();
}

/**
 * Gọi AI (Gemini) và trả text reply.
 */
async function callAi({ userId, systemPrompt, history, message, model, temperature, maxTokens }) {
  const chatHistory = history.map((m) => ({
    role: m.role === 'bot' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  chatHistory.push({ role: 'user', parts: [{ text: message }] });

  const modelName = await resolveAllowedModel(userId, model);
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const systemInstruction = { parts: [{ text: systemPrompt }] };
  const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
    contents: chatHistory,
    systemInstruction,
    model: modelName,
    requestedMaxOutputTokens: maxTokens,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction,
      contents: chatHistory,
      generationConfig: {
        temperature,
        maxOutputTokens,
        // Gemini 2.5 yêu cầu thinking mode — bỏ thinkingBudget=0 (model
        // tự allocate) để không bị reject "Budget 0 is invalid. This model
        // only works in thinking mode."
      },
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Gemini API error: ${response.status}`);
  }
  const data = await response.json();
  const text = joinGeminiTextParts(data?.candidates?.[0]?.content?.parts);
  await aiUsageMeter.record(userId, extractGeminiUsage(data), {
    feature: 'chatbot_reply',
    model: modelName,
  });
  return text;
}

function buildSystemPrompt({ chatbot, settings, subAssistant, ragContext, profileContext, isFirstMessage }) {
  const name = subAssistant?.name || chatbot?.name || 'Trợ lý AI';
  const welcome = settings.welcome_message || subAssistant?.greeting_msg || 'Xin chào!';
  const style = settings.response_style || 'friendly';
  const styleInstructions = {
    friendly: 'Thân thiện, gần gũi.',
    professional: 'Chuyên nghiệp, ngắn gọn.',
    casual: 'Thoải mái, tự nhiên.',
  };
  let prompt = `Bạn là ${name}.

## PHONG CÁCH
${styleInstructions[style] || styleInstructions.friendly}

`;
  if (isFirstMessage) {
    prompt += `## CHÀO
Bắt đầu bằng: "${welcome}"

`;
  }
  prompt += `${ragContext ? ragContext + '\n\n' : ''}${profileContext ? profileContext + '\n\n' : ''}`;
  if (settings.system_instruction?.trim()) {
    prompt += `## HƯỚNG DẪN RIÊNG\n${settings.system_instruction.trim()}\n\n`;
  }
  prompt += `## QUY TẮC
- Trả lời bằng văn bản thuần, KHÔNG markdown.
- Ngắn gọn, rõ ràng.
- Nếu không biết, nói rõ.`;
  return prompt;
}

/**
 * Xử lý 1 inbound message từ Baileys.
 */
async function processIncomingMessage({ sessionKey, msg }) {
  log(`[incoming] session=${sessionKey} raw=${JSON.stringify({ key: msg?.key, hasMsg: !!msg?.message }).slice(0, 200)}`);
  try {
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

    // Với mỗi chatbot bật AI, đảm bảo có conversation và xử lý.
    for (const cb of enabledChatbots) {
      // Handoff: skip nếu AI đã pause cho conversation này.
      const conversation = await getOrCreateConversation({
        sessionKey,
        ownerUserId,
        externalPhone: externalId,
        visitorName: senderName,
        idChatbot: cb.id_chatbot,
        idChannelConnection,
      });
      // Pause check trực tiếp trên channel_conversations.ai_paused.
      const { rows: pauseRows } = await db.query(
        `SELECT ai_paused FROM channel_conversations WHERE id = $1`,
        [conversation.id]
      );
      if (pauseRows[0]?.ai_paused === true) {
        log(`session=${sessionKey} conversation=${conversation.id} AI paused — skip`);
        continue;
      }

      // Persist visitor message (idempotent nhờ messageId nếu có).
      await persistMessage({
        conversationId: conversation.id,
        channelId: idChannelConnection,
        userId: ownerUserId,
        role: 'visitor',
        content: messageText,
        externalId,
        externalMessageId: messageId,
      });

      // Lấy lịch sử + gọi AI.
      try {
        const history = await getHistory(conversation.id);
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
        const systemPrompt = buildSystemPrompt({
          chatbot: { name: cb.chatbot_name },
          settings: {
            welcome_message: cb.welcome_message,
            response_style: cb.response_style,
            system_instruction: cb.system_instruction,
          },
          subAssistant,
          ragContext,
          profileContext,
          isFirstMessage,
        });
        const reply = await callAi({
          userId: ownerUserId,
          systemPrompt,
          history,
          message: messageText,
          model: cb.ai_model || 'gemini-2.5-flash',
          temperature: parseFloat(cb.temperature || 0.7),
          maxTokens: cb.max_tokens || 2048,
        });
        const cleanReply = stripMarkdown(reply);

        // Persist bot reply.
        await persistMessage({
          conversationId: conversation.id,
          channelId: idChannelConnection,
          userId: ownerUserId,
          role: 'bot',
          content: cleanReply,
        });

        // Gửi qua Baileys (adapter đã có Baileys path).
        await whatsappAdapter.sendReply({
          channelId: sessionKey,
          externalId,
          message: cleanReply,
        });
        log(`session=${sessionKey} chatbot=${cb.id_chatbot} conversation=${conversation.id} → replied (${cleanReply.length} chars)`);
      } catch (err) {
        log(`AI/reply error (chatbot=${cb.id_chatbot}):`, err.message);
        try {
          await whatsappAdapter.sendReply({
            channelKey: sessionKey,
            channelId: sessionKey,
            externalId,
            message: VISITOR_CHAT_ERROR_MESSAGE,
          });
        } catch (_) { /* noop */ }
      }
    }
  } catch (err) {
    log('processIncomingMessage error:', err.stack || err.message);
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
