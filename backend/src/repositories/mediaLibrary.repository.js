import db from '../config/database.js';
import uploadController from '../controllers/upload.controller.js';

const ALLOWED_SOURCES = new Set(['chatbot_web', 'chatbot_studio', 'ai_assistant', 'inbox_outbound']);

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
  listOwnedAttachments,
  listChannelAttachments,
  listWorkspaceStorageObjects,
};
