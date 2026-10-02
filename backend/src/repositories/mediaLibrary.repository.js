import db from '../config/database.js';
import uploadController from '../controllers/upload.controller.js';

/**
 * `channel_connections.channel` -> nhãn nền tảng trả cho client. WhatsApp có hai loại kết nối (Baileys / Cloud API)
 * nhưng người dùng chỉ thấy một "WhatsApp". Kênh lạ giữ nguyên mã thô thay vì bị gộp mất.
 */
const CHANNEL_PLATFORM = Object.freeze({
  zalo_oa: 'zalo_oa',
  facebook: 'facebook',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  whatsapp_baileys: 'whatsapp',
});

export function platformFromChannel(channel) {
  return CHANNEL_PLATFORM[channel] || channel || 'channel';
}

function parsePageLimit(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function parseAttachmentList(raw) {
  let attachments = raw;
  if (typeof attachments === 'string') {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      attachments = [];
    }
  }
  return Array.isArray(attachments) ? attachments : [];
}

/**
 * Khoá lưu trữ của MỘT tệp khách gửi qua Telegram/WhatsApp (`{ key, displayName, size, mime, type }` — không có url,
 * xem channelInboundMedia.service.js). Chỉ nhận khoá nằm dưới thư mục của đúng chủ workspace.
 */
function ownedStorageKey(att, ownerUserId) {
  const key = uploadController.normalizeStorageKey(att.key || att.storageKey || '');
  return key.startsWith(`uploads/${ownerUserId}/`) ? key : '';
}

function flattenChannelAttachments(row, platform, ownerUserId) {
  return parseAttachmentList(row.attachments)
    .map((att) => {
      if (!att || typeof att !== 'object') return null;
      const base = {
        platform,
        conversationId: row.id_conversation,
        createdAt: row.created_at,
        messageId: row.id,
      };
      const mime = String(att.mime || att.mimeType || '');
      const type = att.type || (mime.startsWith('image/') ? 'image' : 'file');

      // Tệp ở nền tảng (Zalo / Zalo OA / Facebook): chỉ có link CDN, KHÔNG nằm trên hệ thống, không tính dung lượng.
      const url = att.url || att.src || att.thumbUrl || null;
      if (url) {
        return { ...base, type, url, name: att.name || att.displayName || att.caption || null, stored: false };
      }

      // Tệp Telegram / WhatsApp: đã tải về lưu trên hệ thống (category 'chat', TÍNH dung lượng) — dựng link tải từ khoá.
      const storageKey = ownedStorageKey(att, ownerUserId);
      if (!storageKey) return null;
      return {
        ...base,
        type,
        url: uploadController.buildDownloadUrlByKey(storageKey, { preview: type === 'image' }),
        name: att.displayName || att.name || att.caption || null,
        size: att.size != null && Number.isFinite(Number(att.size)) ? Number(att.size) : null,
        stored: true,
        storageKey,
      };
    })
    .filter(Boolean);
}

/**
 * Tệp KHÁCH GỬI vào các kênh chat (chỉ dòng role 'visitor'; tệp chủ/bot gửi đi không thuộc mục này):
 *  - Zalo / Zalo OA / Facebook cũ: link nền tảng (`stored: false`), nền tảng xoá thì mất, KHÔNG tính dung lượng;
 *  - Telegram / WhatsApp: tệp đã lưu trên hệ thống (`stored: true`), TÍNH dung lượng ở nhóm "Tin nhắn chat" —
 *    chỉ liệt kê tệp còn sống trong sổ lưu trữ (người dùng xoá ở tab "Tất cả tệp" thì biến mất khỏi đây).
 * channel_messages may be missing in some test DBs (42P01 → skip).
 */
export async function listChannelAttachments(ownerUserId, query = {}) {
  const { page, limit, offset } = parsePageLimit(query);
  const collected = [];

  // Zalo personal (always present in bootstrap)
  try {
    const { rows } = await db.query(
      `SELECT id, id_conversation, attachments, created_at
       FROM zalo_personal_messages
       WHERE id_user = $1
         AND role = 'visitor'
         AND attachments IS NOT NULL
         AND jsonb_typeof(attachments) = 'array'
         AND jsonb_array_length(attachments) > 0
       ORDER BY created_at DESC
       LIMIT 200`,
      [ownerUserId]
    );
    for (const row of rows) {
      collected.push(...flattenChannelAttachments(row, 'zalo_personal', ownerUserId));
    }
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  // Zalo OA / Facebook / Telegram / WhatsApp via channel_messages
  try {
    const { rows } = await db.query(
      `SELECT cm.id, cm.id_conversation, cm.attachments, cm.created_at,
              cc.channel
       FROM channel_messages cm
       LEFT JOIN channel_connections cc ON cc.id = cm.id_channel
       WHERE cm.id_user = $1
         AND cm.role = 'visitor'
         AND cm.attachments IS NOT NULL
         AND jsonb_typeof(cm.attachments) = 'array'
         AND jsonb_array_length(cm.attachments) > 0
       ORDER BY cm.created_at DESC
       LIMIT 200`,
      [ownerUserId]
    );
    for (const row of rows) {
      collected.push(...flattenChannelAttachments(row, platformFromChannel(row.channel), ownerUserId));
    }
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  // Tệp lưu trên hệ thống: bỏ tệp không còn trong sổ lưu trữ (đã xoá) + gộp trùng (WhatsApp ghi cùng tệp vào hội
  // thoại của MỌI chatbot đang bật), lấy cỡ thật từ sổ.
  const storedKeys = [...new Set(collected.filter((item) => item.stored).map((item) => item.storageKey))];
  const liveSizes = new Map();
  if (storedKeys.length > 0) {
    const { rows } = await db.query(
      `SELECT storage_key, size_bytes
       FROM storage_objects
       WHERE owner_user_id = $1
         AND pool_type = 'workspace'
         AND state IN ('active', 'temp', 'cleanup_pending')
         AND storage_key = ANY($2::text[])`,
      [ownerUserId, storedKeys]
    );
    for (const row of rows) liveSizes.set(row.storage_key, Number(row.size_bytes || 0));
  }

  collected.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const seenKeys = new Set();
  const visible = [];
  for (const item of collected) {
    if (!item.stored) {
      visible.push(item);
      continue;
    }
    if (!liveSizes.has(item.storageKey) || seenKeys.has(item.storageKey)) continue;
    seenKeys.add(item.storageKey);
    const publicItem = { ...item, size: liveSizes.get(item.storageKey) };
    delete publicItem.storageKey; // khoá lưu trữ không ra client — chỉ link tải đã ký
    visible.push(publicItem);
  }

  const total = visible.length;
  const items = visible.slice(offset, offset + limit);
  return {
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    },
  };
}

export async function listWorkspaceStorageObjects(ownerUserId, query = {}) {
  const { page, limit, offset } = parsePageLimit(query);
  const category = String(query.category || '').trim();
  const search = String(query.search || '').trim();

  const params = [ownerUserId];
  let filterSql = ` WHERE so.owner_user_id = $1 AND so.pool_type = 'workspace' AND so.state IN ('active', 'temp', 'cleanup_pending')`;

  if (category) {
    params.push(category);
    filterSql += ` AND so.category = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    filterSql += ` AND (so.storage_key ILIKE $${params.length} OR ca.display_name ILIKE $${params.length})`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM storage_objects so
     LEFT JOIN (
       SELECT DISTINCT ON (storage_object_id) storage_object_id, display_name, mime_type
       FROM chat_attachments
       WHERE storage_object_id IS NOT NULL
       ORDER BY storage_object_id, id DESC
     ) ca ON ca.storage_object_id = so.id
     ${filterSql}`,
    params
  );

  const summaryRes = await db.query(
    `SELECT so.category,
            COUNT(*)::int AS count,
            COALESCE(SUM(so.size_bytes), 0)::bigint AS total_bytes
     FROM storage_objects so
     WHERE so.owner_user_id = $1
       AND so.pool_type = 'workspace'
       AND so.state IN ('active', 'temp', 'cleanup_pending')
     GROUP BY so.category
     ORDER BY total_bytes DESC`,
    [ownerUserId]
  );

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT so.id,
            so.storage_key,
            so.temp_key,
            so.category,
            so.state,
            so.size_bytes,
            so.expires_at,
            so.reference_type,
            so.reference_id,
            so.created_at,
            ca.display_name AS chat_display_name,
            ca.mime_type AS chat_mime_type
     FROM storage_objects so
     LEFT JOIN (
       SELECT DISTINCT ON (storage_object_id) storage_object_id, display_name, mime_type
       FROM chat_attachments
       WHERE storage_object_id IS NOT NULL
       ORDER BY storage_object_id, id DESC
     ) ca ON ca.storage_object_id = so.id
     ${filterSql}
     ORDER BY so.size_bytes DESC, so.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = countRes.rows[0]?.total || 0;

  const items = rows.map((row) => {
    const key = row.storage_key || row.temp_key || '';
    const baseName = key ? key.split('/').pop() : 'unnamed';
    const displayName = row.chat_display_name || baseName;
    const ext = (baseName.includes('.') ? baseName.split('.').pop() : '').toLowerCase();

    let mimeType = row.chat_mime_type || null;
    if (!mimeType && ext) {
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext}`;
      } else if (['mp4', 'webm', 'mov'].includes(ext)) {
        mimeType = `video/${ext}`;
      } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
        mimeType = `audio/${ext}`;
      } else if (ext === 'pdf') {
        mimeType = 'application/pdf';
      } else if (['doc', 'docx'].includes(ext)) {
        mimeType = 'application/msword';
      } else if (['xls', 'xlsx'].includes(ext)) {
        mimeType = 'application/vnd.ms-excel';
      } else {
        mimeType = 'application/octet-stream';
      }
    }

    const isImage = String(mimeType || '').startsWith('image/');
    const url = row.storage_key ? uploadController.buildDownloadUrlByKey(row.storage_key, { preview: isImage }) : null;

    return {
      id: row.id,
      storageKey: row.storage_key,
      tempKey: row.temp_key,
      category: row.category,
      state: row.state,
      sizeBytes: Number(row.size_bytes || 0),
      size: Number(row.size_bytes || 0),
      displayName,
      name: displayName,
      mimeType,
      type: isImage ? 'image' : 'file',
      url,
      expiresAt: row.expires_at,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      createdAt: row.created_at,
    };
  });

  return {
    items,
    categorySummary: summaryRes.rows.map((r) => ({
      category: r.category,
      count: Number(r.count),
      totalBytes: Number(r.total_bytes),
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export default {
  listChannelAttachments,
  listWorkspaceStorageObjects,
};
