import db from '../../config/database.js';
import uploadController from '../../controllers/upload.controller.js';

const ALLOWED_SOURCES = new Set(['chatbot_web', 'chatbot_studio', 'ai_assistant']);

function parsePageLimit(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function mapLibraryRow(row) {
  const isImage = String(row.mime_type || '').startsWith('image/');
  return {
    id: row.id,
    source: row.source,
    storageKey: row.storage_key,
    displayName: row.display_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    conversationRef: row.conversation_ref,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    type: isImage ? 'image' : 'file',
    url: uploadController.buildDownloadUrlByKey(row.storage_key, { preview: isImage }),
    name: row.display_name,
    size: row.size_bytes != null ? Number(row.size_bytes) : null,
  };
}

export async function listOwnedAttachments(ownerUserId, query = {}) {
  const { page, limit, offset } = parsePageLimit(query);
  const source = String(query.source || '').trim();
  const params = [ownerUserId];
  let sourceSql = '';
  if (source && ALLOWED_SOURCES.has(source)) {
    params.push(source);
    sourceSql = ` AND source = $${params.length}`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM chat_attachments
     WHERE id_user = $1${sourceSql}`,
    params
  );

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT id, source, storage_key, display_name, mime_type, size_bytes,
            conversation_ref, created_at, expires_at
     FROM chat_attachments
     WHERE id_user = $1${sourceSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = countRes.rows[0]?.total || 0;
  return {
    items: rows.map(mapLibraryRow),
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

function flattenChannelAttachments(row, platform) {
  let attachments = row.attachments;
  if (typeof attachments === 'string') {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      attachments = [];
    }
  }
  if (!Array.isArray(attachments) || !attachments.length) return [];

  return attachments
    .map((att) => {
      if (!att || typeof att !== 'object') return null;
      const url = att.url || att.src || att.thumbUrl || null;
      if (!url) return null;
      const type = att.type || (String(att.mime || '').startsWith('image/') ? 'image' : 'file');
      return {
        type,
        url,
        name: att.name || att.displayName || att.caption || null,
        platform,
        conversationId: row.id_conversation,
        createdAt: row.created_at,
        messageId: row.id,
      };
    })
    .filter(Boolean);
}

/**
 * Best-effort platform media — URL only, no download/sign.
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
         AND attachments IS NOT NULL
         AND jsonb_typeof(attachments) = 'array'
         AND jsonb_array_length(attachments) > 0
       ORDER BY created_at DESC
       LIMIT 200`,
      [ownerUserId]
    );
    for (const row of rows) {
      collected.push(...flattenChannelAttachments(row, 'zalo_personal'));
    }
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  // Zalo OA / Facebook via channel_messages
  try {
    const { rows } = await db.query(
      `SELECT cm.id, cm.id_conversation, cm.attachments, cm.created_at,
              cc.channel
       FROM channel_messages cm
       LEFT JOIN channel_connections cc ON cc.id = cm.id_channel
       WHERE cm.id_user = $1
         AND cm.attachments IS NOT NULL
         AND jsonb_typeof(cm.attachments) = 'array'
         AND jsonb_array_length(cm.attachments) > 0
       ORDER BY cm.created_at DESC
       LIMIT 200`,
      [ownerUserId]
    );
    for (const row of rows) {
      const platform = row.channel === 'facebook' ? 'facebook'
        : row.channel === 'zalo_oa' ? 'zalo_oa'
          : (row.channel || 'channel');
      collected.push(...flattenChannelAttachments(row, platform));
    }
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  collected.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = collected.length;
  const items = collected.slice(offset, offset + limit);
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

export default {
  listOwnedAttachments,
  listChannelAttachments,
};
