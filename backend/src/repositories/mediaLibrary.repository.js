import db from '../config/database.js';
import uploadController from '../controllers/upload.controller.js';
import { escapeLikePattern, friendlyFileName } from '../utils/storageFileName.util.js';

/** Cùng điều kiện với hàm tính hạn mức (`storage.repository.js` QUOTA_USAGE_STATES): tổng các thẻ = số đã dùng. */
const LIVE_STATES_SQL = `('active', 'temp', 'cleanup_pending')`;

/**
 * Bản ghi tệp + dòng danh mục chat (nếu là tệp chat). Nối theo KHOÁ lưu trữ — duy nhất ở cả hai bảng — nên không còn
 * `DISTINCT ON` quét cả bảng chat_attachments của mọi khách (M-10), và tệp chat cũ có `storage_object_id` NULL (8 tệp của
 * admin) cũng lấy được tên + nguồn.
 */
const FROM_SQL = `FROM storage_objects so
     LEFT JOIN chat_attachments ca ON ca.storage_key = so.storage_key`;

function parsePageLimit(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Tệp trợ lý AI do người khác tải lên. Phiên Trợ lý AI là riêng từng người (`aiSession.repository.js` id_user), nên
 * nhân viên không thấy tệp trợ lý của chủ/đồng nghiệp — chỉ tệp chính mình tải lên (`actor_user_id`).
 */
function visibilitySql(viewer, params) {
  if (!viewer?.restrictAssistantFiles) return '';
  params.push(viewer.actorUserId);
  return ` AND NOT (ca.source = 'ai_assistant' AND so.actor_user_id IS DISTINCT FROM $${params.length})`;
}

/**
 * @param {number|string} ownerUserId chủ workspace
 * @param {{ category?: string, search?: string, sort?: 'size'|'newest', page?: number, limit?: number }} query
 * @param {{ restrictAssistantFiles?: boolean, actorUserId?: number }} viewer nhân viên chỉ thấy tệp trợ lý AI của chính mình
 */
export async function listWorkspaceStorageObjects(ownerUserId, query = {}, viewer = {}) {
  const { page, limit, offset } = parsePageLimit(query);
  const category = String(query.category || '').trim();
  const search = String(query.search || '').trim();
  const sortSql = query.sort === 'newest'
    ? 'so.created_at DESC, so.id DESC'
    : 'so.size_bytes DESC, so.id DESC';

  const baseWhere = ` WHERE so.owner_user_id = $1 AND so.pool_type = 'workspace' AND so.state IN ${LIVE_STATES_SQL}`;

  // Thẻ tổng: mọi danh mục, KHÔNG chịu bộ lọc danh mục/tìm kiếm (đây là bảng "dung lượng đang nằm ở đâu").
  const summaryParams = [ownerUserId];
  const summaryWhere = baseWhere + visibilitySql(viewer, summaryParams);

  // Danh sách + đếm trang.
  const listParams = [ownerUserId];
  let listWhere = baseWhere;
  if (category) {
    listParams.push(category);
    listWhere += ` AND so.category = $${listParams.length}`;
  } else {
    // Bản lưu tự động của landing (mỗi trang giữ 5 bản) không phải tệp người dùng quản lý: ẩn khỏi lưới, vẫn nằm
    // trong thẻ tổng (nó có tốn dung lượng). Lọc đích danh category này thì vẫn liệt kê được.
    listWhere += ` AND so.category <> 'landing_version'`;
  }
  if (search) {
    // Chỉ tìm theo TÊN: phần sau dấu `/` cuối của khoá lưu trữ, hoặc tên hiển thị của tệp chat. Không còn khớp đường
    // dẫn nội bộ (gõ "1" hay "chat" từng khớp mọi tệp), và `%`/`_` gõ vào là chữ thường.
    listParams.push(`%${escapeLikePattern(search)}%`);
    listWhere += ` AND (regexp_replace(COALESCE(so.storage_key, so.temp_key, ''), '^.*/', '') ILIKE $${listParams.length} ESCAPE '\\'`
      + ` OR ca.display_name ILIKE $${listParams.length} ESCAPE '\\')`;
  }
  listWhere += visibilitySql(viewer, listParams);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total ${FROM_SQL}${listWhere}`,
    listParams
  );

  const summaryRes = await db.query(
    `SELECT so.category,
            COUNT(*)::int AS count,
            COALESCE(SUM(so.size_bytes), 0)::bigint AS total_bytes
     ${FROM_SQL}${summaryWhere}
     GROUP BY so.category
     ORDER BY total_bytes DESC`,
    summaryParams
  );

  listParams.push(limit, offset);
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
            ca.mime_type AS chat_mime_type,
            ca.source AS chat_source
     ${FROM_SQL}${listWhere}
     ORDER BY ${sortSql}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const total = countRes.rows[0]?.total || 0;

  const items = rows.map((row) => {
    const key = row.storage_key || row.temp_key || '';
    const baseName = key ? key.split('/').pop() : 'unnamed';
    const displayName = row.chat_display_name || friendlyFileName(baseName);
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
      // Chỉ tệp TẠM mới thật sự tự xoá khi hết hạn (kho dọn tệp temp quá hạn). Tệp chat đã gắn vào tin nhắn còn
      // `expires_at` 90 ngày nhưng bước dọn bỏ qua tệp đang được tin nhắn tham chiếu — không hứa "tự xoá" cho nó.
      autoDeleteAt: row.state === 'temp' && row.expires_at ? row.expires_at : null,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      source: row.chat_source || null,
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

/**
 * Tệp này có phải tệp Trợ lý AI do NGƯỜI KHÁC tải lên không (đối với người đang xem)? Dùng để chặn nhân viên mở/xoá tệp
 * mà danh sách đã ẩn khỏi họ (cùng quy tắc với `visibilitySql`).
 * @param {{ storage_key?: string|null, actor_user_id?: string|number|null }} object hàng storage_objects
 */
export async function isAssistantUploadOfOthers(object, viewerUserId) {
  if (!object?.storage_key) return false;
  if (String(object.actor_user_id ?? '') === String(viewerUserId ?? '')) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM chat_attachments WHERE storage_key = $1 AND source = 'ai_assistant' LIMIT 1`,
    [object.storage_key]
  );
  return rows.length > 0;
}

/**
 * Xoá dòng danh mục `chat_attachments` của một tệp chat vừa xoá khỏi kho. Khớp theo khoá lưu trữ (duy nhất) HOẶC theo
 * storage_object_id — tệp chat cũ có `storage_object_id` NULL nhưng luôn có khoá. Trả về tên hiển thị của các dòng đã xoá.
 */
export async function deleteChatCatalogRows({ storageObjectId = null, storageKey = null } = {}) {
  if (storageObjectId == null && !storageKey) return [];
  const { rows } = await db.query(
    `DELETE FROM chat_attachments
      WHERE storage_key = $1 OR storage_object_id = $2
      RETURNING display_name`,
    [storageKey || null, storageObjectId ?? null]
  );
  return rows.map((row) => row.display_name).filter(Boolean);
}

export default {
  listWorkspaceStorageObjects,
  isAssistantUploadOfOthers,
  deleteChatCatalogRows,
};
