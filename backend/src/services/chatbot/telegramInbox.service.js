/**
 * telegramInbox.service.js
 *
 * Đưa hội thoại Telegram cá nhân vào Hộp thư hợp nhất (PLAN_TG_WA_DAY_DU P1), theo khuôn WhatsApp Baileys
 * (`whatsappBaileysInbox.service.js`): ghi `channel_connections` / `channel_conversations` / `channel_messages`
 * với `channel = 'telegram'`. Hộp thư dùng chung kiểu `'channel'`.
 *
 * GHI SONG SONG: `telegram_personal_conversations` / `telegram_personal_messages` vẫn được ghi (chiến dịch
 * Telegram và lịch sử AI còn đọc bảng cũ). Phần tạm dừng AI thì MỘT nguồn sự thật: `channel_conversations.ai_paused*`
 * (cột `telegram_personal_conversations.ai_paused*` không còn được đọc).
 *
 * external_id hội thoại = `telegram:<accountId>:<chatId>` (chatId nhóm âm `-100…` giữ nguyên chuỗi).
 * Ràng buộc thật của bảng: UNIQUE (id_channel, external_id) — mỗi tài khoản có đúng một dòng
 * channel_connections nên khoá này đủ; không có unique (id_user, channel, external_channel_id) nên
 * tìm-trước-rồi-thêm, đụng khoá (23505) thì đọc lại.
 */
import db from '../../config/database.js';
import sseService from '../sse.service.js';

export const TELEGRAM_INBOX_CHANNEL = 'telegram';

export function buildTelegramInboxExternalId(accountId, chatId) {
  return `telegram:${accountId}:${chatId}`;
}

/** Tách `telegram:<accountId>:<chatId>` → `{ accountId, chatId }` (chatId giữ nguyên chuỗi, kể cả dấu âm). */
export function parseTelegramInboxExternalId(externalId) {
  const m = /^telegram:(\d+):(.+)$/.exec(String(externalId || ''));
  if (!m) return null;
  return { accountId: Number(m[1]), chatId: m[2] };
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 3 ? `***${digits.slice(-3)}` : '';
}

function accountDisplayName(account) {
  const name = [account?.first_name, account?.last_name].filter(Boolean).join(' ').trim();
  const handle = account?.username ? `@${account.username}` : '';
  // Không thêm tiền tố "Telegram": nhãn kênh (Hộp thư, email cảnh báo liên hệ) đã tự ghi "Telegram <tên>".
  return name || handle || maskPhone(account?.phone) || `#${account?.id}`;
}

/**
 * Lấy / tạo dòng channel_connections cho một tài khoản Telegram (`external_channel_id = String(account.id)`).
 * @param {{id:number, id_user:number}} account - dòng telegram_accounts
 * @returns {Promise<{id: number}>}
 */
export async function getOrCreateTelegramChannelConnection(account) {
  const select = () => db.query(
    `SELECT id FROM channel_connections
      WHERE channel = 'telegram' AND external_channel_id = $1 AND id_user = $2
      ORDER BY id ASC LIMIT 1`,
    [String(account.id), account.id_user]
  );
  const { rows: existing } = await select();
  if (existing[0]) return existing[0];
  try {
    const { rows: created } = await db.query(
      `INSERT INTO channel_connections
         (id_user, channel, external_channel_id, display_name, is_active, settings)
       VALUES ($1, 'telegram', $2, $3, true, '{}'::jsonb)
       RETURNING id`,
      [account.id_user, String(account.id), accountDisplayName(account)]
    );
    return created[0];
  } catch (err) {
    if (err?.code !== '23505') throw err;
    const { rows } = await select();
    if (rows[0]) return rows[0];
    throw err;
  }
}

/**
 * Đảm bảo có dòng channel_conversations cho (tài khoản, chat). Trả `{ id, id_channel, visitor_name, id_user }`.
 * Dòng mới thừa hưởng trạng thái tạm dừng AI của dòng cũ (`telegram_personal_conversations`) để lần triển khai
 * đầu không bật lại AI cho khách chủ đang tự xử lý.
 *
 * @param {object} p
 * @param {object} p.account - dòng telegram_accounts
 * @param {string|number} p.chatId
 * @param {string|null} [p.displayName]
 * @param {number|null} [p.idChatbot]
 * @param {boolean} [p.isGroup]
 * @param {number|null} [p.legacyConversationId]
 * @param {{ai_paused?: boolean, ai_paused_at?: any}|null} [p.legacyPause]
 */
export async function ensureTelegramInboxConversation({
  account,
  chatId,
  displayName = null,
  idChatbot = null,
  isGroup = false,
  legacyConversationId = null,
  legacyPause = null,
}) {
  const conn = await getOrCreateTelegramChannelConnection(account);
  const externalId = buildTelegramInboxExternalId(account.id, chatId);
  const info = {
    chatbot_id: idChatbot ?? null,
    is_group: Boolean(isGroup),
    telegram_conversation_id: legacyConversationId ?? null,
  };

  const select = () => db.query(
    `SELECT id, id_channel, id_user, visitor_name, visitor_info
       FROM channel_conversations
      WHERE id_channel = $1 AND external_id = $2
      ORDER BY id DESC LIMIT 1`,
    [conn.id, externalId]
  );

  const { rows: existing } = await select();
  if (existing[0]) {
    const row = existing[0];
    const prev = typeof row.visitor_info === 'string'
      ? (() => { try { return JSON.parse(row.visitor_info); } catch { return {}; } })()
      : (row.visitor_info || {});
    const infoChanged = prev.chatbot_id !== info.chatbot_id
      || prev.is_group !== info.is_group
      || prev.telegram_conversation_id !== info.telegram_conversation_id;
    const needName = !row.visitor_name && displayName;
    if (infoChanged || needName) {
      await db.query(
        `UPDATE channel_conversations
            SET visitor_info = COALESCE(visitor_info, '{}'::jsonb) || $2::jsonb,
                visitor_name = COALESCE(NULLIF(visitor_name, ''), $3)
          WHERE id = $1`,
        [row.id, JSON.stringify(info), displayName || null]
      );
    }
    return {
      id: row.id,
      id_channel: row.id_channel,
      id_user: row.id_user ?? account.id_user,
      visitor_name: row.visitor_name || displayName || null,
    };
  }

  const carryPause = legacyPause?.ai_paused === true;
  try {
    const { rows: created } = await db.query(
      `INSERT INTO channel_conversations
         (id_user, id_channel, channel, external_id, visitor_name, visitor_info, ai_paused, ai_paused_at)
       VALUES ($1, $2, 'telegram', $3, $4, $5::jsonb, $6, $7)
       RETURNING id, id_channel, id_user, visitor_name`,
      [
        account.id_user,
        conn.id,
        externalId,
        displayName || null,
        JSON.stringify(info),
        carryPause,
        carryPause ? (legacyPause.ai_paused_at || null) : null,
      ]
    );
    return created[0];
  } catch (err) {
    if (err?.code !== '23505') throw err;
    const { rows } = await select();
    if (rows[0]) {
      return { id: rows[0].id, id_channel: rows[0].id_channel, id_user: account.id_user, visitor_name: rows[0].visitor_name };
    }
    throw err;
  }
}

/** Tìm (KHÔNG tạo) hội thoại Hộp thư của (tài khoản, chat). */
export async function findTelegramInboxConversation(account, chatId) {
  const { rows } = await db.query(
    `SELECT cc.id, cc.id_channel, cc.id_user, cc.visitor_name
       FROM channel_conversations cc
       JOIN channel_connections ch ON ch.id = cc.id_channel
      WHERE cc.id_user = $1 AND cc.channel = 'telegram'
        AND ch.external_channel_id = $2
        AND cc.external_id = $3
      ORDER BY cc.id DESC LIMIT 1`,
    [account.id_user, String(account.id), buildTelegramInboxExternalId(account.id, chatId)]
  );
  return rows[0] || null;
}

/**
 * Ghi một tin vào channel_messages. Có `externalId` thì chống trùng theo (hội thoại, external_id).
 * @returns {Promise<{id: number|null, duplicate?: boolean}>}
 */
export async function persistTelegramChannelMessage({ conversation, userId, role, content, externalId = null, metadata = {} }) {
  const externalRef = externalId != null && externalId !== '' ? String(externalId) : null;
  if (externalRef) {
    const { rows: dup } = await db.query(
      `SELECT id FROM channel_messages WHERE id_conversation = $1 AND external_id = $2 LIMIT 1`,
      [conversation.id, externalRef]
    );
    if (dup[0]) return { id: dup[0].id, duplicate: true };
  }
  const { rows } = await db.query(
    `INSERT INTO channel_messages
       (id_conversation, id_user, id_channel, role, content, message_type,
        external_id, external_ts, attachments, metadata, raw_data)
     VALUES ($1, $2, $3, $4, $5, 'text', $6, NOW(), '[]'::jsonb, $7::jsonb, '{}'::jsonb)
     RETURNING id`,
    [conversation.id, userId, conversation.id_channel, role, content, externalRef, JSON.stringify(metadata || {})]
  );
  return { id: rows[0]?.id ?? null };
}

/** Ghi id tin Telegram vừa gửi vào dòng đã lưu của Hộp thư (khử echo). Không ghi đè id đã có. */
export async function bindTelegramChannelMessageId(channelMessageId, messageId) {
  if (!channelMessageId || messageId == null || messageId === '') return;
  try {
    await db.query(
      `UPDATE channel_messages SET external_id = $2 WHERE id = $1 AND external_id IS NULL`,
      [channelMessageId, String(messageId)]
    );
  } catch (err) {
    console.warn('[Telegram/Inbox] bind channel message id failed:', err.message);
  }
}

/** Phát SSE `inbox:new_message` cho chủ tài khoản. Không bao giờ ném lỗi. */
export function broadcastTelegramInbox({ ownerUserId, conversation, role, message, senderId = null, senderName = null, isGroup = false, messageId = null, extra = {} }) {
  try {
    sseService.broadcast(String(ownerUserId), 'inbox:new_message', {
      conversationId: conversation.id,
      conversationType: 'channel',
      type: 'channel',
      channel: TELEGRAM_INBOX_CHANNEL,
      message,
      messageId,
      senderId,
      senderName,
      visitorName: conversation.visitor_name || senderName || null,
      isGroup: Boolean(isGroup),
      role,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  } catch (err) {
    console.warn('[Telegram/Inbox] SSE broadcast failed:', err.message);
  }
}

/**
 * Trả lời tay từ Hộp thư: ghi thêm dòng `agent` vào `telegram_personal_messages` (ghi song song) để lịch sử
 * bảng cũ đủ. Best-effort; không có hội thoại cũ đang mở thì bỏ qua.
 */
export async function recordManualReplyInLegacyTables({ accountId, chatId, userId, text, messageId = null }) {
  try {
    const { rows } = await db.query(
      `SELECT id FROM telegram_personal_conversations
        WHERE id_telegram_account = $1 AND external_id = $2 AND status = 'open'
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT 1`,
      [accountId, String(chatId)]
    );
    const legacyId = rows[0]?.id;
    if (!legacyId) return null;
    const ins = await db.query(
      `INSERT INTO telegram_personal_messages
         (id_conversation, id_user, external_message_id, role, content, metadata)
       VALUES ($1, $2, $3, 'agent', $4, $5)
       RETURNING id`,
      [
        legacyId,
        userId,
        messageId != null ? String(messageId) : null,
        text || null,
        JSON.stringify({ source: 'manual_inbox', chat_id: String(chatId) }),
      ]
    );
    await db.query(
      `UPDATE telegram_personal_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [legacyId]
    );
    return ins.rows[0]?.id ?? null;
  } catch (err) {
    console.warn('[Telegram/Inbox] legacy agent message dual-write failed:', err.message);
    return null;
  }
}
