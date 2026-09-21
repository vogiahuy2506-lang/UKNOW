import db from '../config/database.js';

export async function createSession(userId, title) {
  const { rows } = await db.query(
    `INSERT INTO ai_chat_sessions (id_user, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at`,
    [userId, title.slice(0, 255)]
  );
  return rows[0];
}

export async function getUserSessions(userId) {
  const { rows } = await db.query(
    `SELECT id, title, created_at, updated_at
     FROM ai_chat_sessions
     WHERE id_user = $1
     ORDER BY updated_at DESC
     LIMIT 30`,
    [userId]
  );
  return rows;
}

// Trả null nếu session không tồn tại hoặc không thuộc userId
export async function getSessionMessages(sessionId, userId) {
  const { rows: sessions } = await db.query(
    `SELECT id, wizard_state FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  if (!sessions.length) return null;

  const { rows } = await db.query(
    `SELECT id, role, content, type, data, missing_fields
     FROM ai_chat_messages
     WHERE session_id = $1
     ORDER BY id ASC`,
    [sessionId]
  );
  // id là BIGSERIAL → pg trả chuỗi; đổi sang số cho khớp `data.messageId` của đường sinh landing.
  // Frontend đã đọc `msg.id` (AiChatbot.jsx: messageId={msg.id}) — thiếu cột này thì thẻ landing
  // tải lại từ phiên không có id, mọi lượt sửa rơi về "tin landing_page mới nhất".
  const messages = rows.map((row) => ({ ...row, id: Number(row.id) }));
  return { messages, wizardState: sessions[0].wizard_state || null };
}

/**
 * Lấy các file đính kèm từ các tin user sau tin landing_page gần nhất trong session.
 * Chỉ nhận file đã promote vào uploads/<ownerUserId>/chat/.
 */
export async function listUserFilesSinceLastLanding(sessionId, userId, ownerUserId) {
  const sid = Number(sessionId);
  const uid = Number(userId);
  if (!sid || !uid) return [];

  const { rows: sessions } = await db.query(
    `SELECT id FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
    [sid, uid]
  );
  if (!sessions.length) return [];

  const { rows } = await db.query(
    `WITH last_landing AS (
       SELECT COALESCE(MAX(id), 0) AS max_id
       FROM ai_chat_messages
       WHERE session_id = $1 AND role = 'assistant' AND type = 'landing_page'
     )
     SELECT data->'files' AS files
     FROM ai_chat_messages, last_landing
     WHERE session_id = $1
       AND role = 'user'
       AND id > last_landing.max_id
       AND data->'files' IS NOT NULL
     ORDER BY id DESC`,
    [sid]
  );

  const prefix = `uploads/${ownerUserId}/chat/`;
  const result = [];
  const seenKeys = new Set();

  for (const row of rows) {
    const list = Array.isArray(row.files) ? row.files : [];
    for (const f of list) {
      const sk = f?.storage_key || f?.storageKey;
      if (typeof sk === 'string' && sk.startsWith(prefix) && !seenKeys.has(sk)) {
        seenKeys.add(sk);
        result.push({
          storageKey: sk,
          originalName: f.originalName || f.displayName || 'file',
          contentType: f.contentType || '',
          size: f.size ?? 0,
        });
      }
    }
  }

  return result;
}


// Trả { id, wizard_state } hoặc null (không tồn tại / không thuộc userId)
export async function getSessionWizardState(sessionId, userId) {
  const { rows } = await db.query(
    `SELECT id, wizard_state FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return rows[0] || null;
}

const EMPTY_PLAN_SECTION = {
  snapshot: null, sourcePrompt: '', requiresApproval: true, savedTemplates: [], status: null, campaignId: null,
};

const EMPTY_WIZARD_STATE_DEFAULT = {
  v: 1, gates: {}, plan: EMPTY_PLAN_SECTION, brief: {}, meta: {},
};

// Ghi state theo section từ chat path (gates/meta/plan/brief) bằng jsonb_set.
// Khi KHÔNG có planReset/planSnapshot thì tuyệt đối không đụng section plan —
// tránh clobber plan.savedTemplates do PATCH ghi song song.
// sections = { gates?, meta?, brief?, planSnapshot?, planSourcePrompt?, planRequiresApproval?, planReset? }
export async function updateWizardStateSections(sessionId, userId, sections = {}) {
  const base = `COALESCE(wizard_state, '${JSON.stringify(EMPTY_WIZARD_STATE_DEFAULT)}'::jsonb)`;
  let expr = base;
  const params = [sessionId, userId];
  const addSet = (path, value) => {
    params.push(JSON.stringify(value ?? null));
    expr = `jsonb_set(${expr}, '{${path}}', $${params.length}::jsonb, true)`;
  };

  if (sections.planReset) {
    // Revision: xóa sạch plan cũ
    addSet('plan', EMPTY_PLAN_SECTION);
  } else if (sections.planSnapshot != null) {
    // Plan MỚI = lifecycle mới: replace nguyên section (kể cả savedTemplates cũ)
    addSet('plan', {
      ...EMPTY_PLAN_SECTION,
      snapshot: sections.planSnapshot,
      sourcePrompt: sections.planSourcePrompt ?? '',
      requiresApproval: sections.planRequiresApproval !== false,
      status: 'waiting_day_confirm',
    });
  }
  if (sections.gates) addSet('gates', sections.gates);
  if (sections.meta) addSet('meta', sections.meta);
  if (sections.brief) addSet('brief', sections.brief);
  if (expr === base) return;

  await db.query(
    `UPDATE ai_chat_sessions SET wizard_state = ${expr} WHERE id = $1 AND id_user = $2`,
    params
  );
}

// Overwrite toàn bộ wizard_state (dành cho PATCH path sau reducer)
export async function writeWizardState(sessionId, userId, state) {
  const { rows } = await db.query(
    `UPDATE ai_chat_sessions SET wizard_state = $3::jsonb
     WHERE id = $1 AND id_user = $2
     RETURNING wizard_state`,
    [sessionId, userId, JSON.stringify(state)]
  );
  return rows[0]?.wizard_state ?? null;
}

// Lưu cặp user + assistant message và cập nhật updated_at của session.
// INSERT được gate bằng ownership (WHERE EXISTS) — không ghi được vào session của
// người khác kể cả khi sessionId bị giả mạo. Trả true nếu đã ghi.
export async function saveMessages(sessionId, userId, userContent, assistantMsg, userFiles = []) {
  const userData = Array.isArray(userFiles) && userFiles.length
    ? JSON.stringify({ files: userFiles })
    : null;
  const { rowCount } = await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     SELECT * FROM (VALUES
       ($1::bigint, 'user',      $3::text, NULL::varchar, $8::jsonb, NULL::jsonb),
       ($1::bigint, 'assistant', $4::text, $5::varchar,   $6::jsonb,   $7::jsonb)
     ) AS v(session_id, role, content, type, data, missing_fields)
     WHERE EXISTS (SELECT 1 FROM ai_chat_sessions WHERE id = $1 AND id_user = $2)`,
    [
      sessionId,
      userId,
      userContent,
      assistantMsg.content ?? '',
      assistantMsg.type ?? null,
      assistantMsg.data != null ? JSON.stringify(assistantMsg.data) : null,
      assistantMsg.missing_fields?.length ? JSON.stringify(assistantMsg.missing_fields) : null,
      userData,
    ]
  );
  if (!rowCount) return false;
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return true;
}

// Cùng SQL với saveMessages, thêm RETURNING để biết id tin vừa lưu (thẻ landing cần id để vòng tự
// sửa đếm trần lượt theo từng tin). saveMessages giữ nguyên trả boolean — nhiều nơi đang dùng.
// Trả { userMessageId, assistantMessageId } hoặc null nếu không ghi được.
export async function saveMessagesReturningIds(sessionId, userId, userContent, assistantMsg, userFiles = []) {
  const userData = Array.isArray(userFiles) && userFiles.length
    ? JSON.stringify({ files: userFiles })
    : null;
  const { rowCount, rows } = await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     SELECT * FROM (VALUES
       ($1::bigint, 'user',      $3::text, NULL::varchar, $8::jsonb, NULL::jsonb),
       ($1::bigint, 'assistant', $4::text, $5::varchar,   $6::jsonb,   $7::jsonb)
     ) AS v(session_id, role, content, type, data, missing_fields)
     WHERE EXISTS (SELECT 1 FROM ai_chat_sessions WHERE id = $1 AND id_user = $2)
     RETURNING id, role`,
    [
      sessionId,
      userId,
      userContent,
      assistantMsg.content ?? '',
      assistantMsg.type ?? null,
      assistantMsg.data != null ? JSON.stringify(assistantMsg.data) : null,
      assistantMsg.missing_fields?.length ? JSON.stringify(assistantMsg.missing_fields) : null,
      userData,
    ]
  );
  if (!rowCount) return null;
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  const idOf = (role) => {
    const row = (rows || []).find((r) => r.role === role);
    return row ? Number(row.id) : null;
  };
  return { userMessageId: idOf('user'), assistantMessageId: idOf('assistant') };
}

// Lưu một assistant message duy nhất (không có user message đi kèm) — cùng gate ownership.
export async function saveAssistantMessage(sessionId, userId, assistantMsg) {
  const { rowCount } = await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     SELECT $1::bigint, 'assistant', $3::text, $4::varchar, $5::jsonb, NULL::jsonb
     WHERE EXISTS (SELECT 1 FROM ai_chat_sessions WHERE id = $1 AND id_user = $2)`,
    [
      sessionId,
      userId,
      assistantMsg.content ?? '',
      assistantMsg.type ?? null,
      assistantMsg.data != null ? JSON.stringify(assistantMsg.data) : null,
    ]
  );
  if (!rowCount) return false;
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return true;
}

export async function deleteSession(sessionId, userId) {
  const { rowCount } = await db.query(
    `DELETE FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return rowCount > 0;
}

// Đọc MỘT tin landing_page: { id, data } hoặc null. messageId null → tin landing_page mới nhất của
// phiên — CÙNG luật với nhánh null của updateLandingPageMessage bên dưới. Có gate ownership.
export async function getLandingPageMessage(sessionId, userId, messageId = null) {
  const mid = Number(messageId);
  const byId = Number.isInteger(mid) && mid > 0;
  const { rows } = await db.query(
    `SELECT m.id, m.data
     FROM ai_chat_messages m
     JOIN ai_chat_sessions s ON s.id = m.session_id
     WHERE m.session_id = $1 AND s.id_user = $2 AND m.type = 'landing_page'
       ${byId ? 'AND m.id = $3' : ''}
     ORDER BY m.id DESC
     LIMIT 1`,
    byId ? [sessionId, userId, mid] : [sessionId, userId]
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), data: rows[0].data || {} };
}

export async function updateLandingPageMessage(sessionId, userId, updatedData, messageId = null) {
  const mid = Number(messageId);
  let queryText;
  let params;

  if (Number.isInteger(mid) && mid > 0) {
    queryText = `
      UPDATE ai_chat_messages
      SET data = COALESCE(data, '{}'::jsonb) || $3::jsonb
      WHERE id = $4 AND session_id = $1 AND type = 'landing_page' AND EXISTS (
        SELECT 1 FROM ai_chat_sessions WHERE id = $1 AND id_user = $2
      )
    `;
    params = [sessionId, userId, JSON.stringify(updatedData), mid];
  } else {
    queryText = `
      UPDATE ai_chat_messages
      SET data = COALESCE(data, '{}'::jsonb) || $3::jsonb
      WHERE id = (
        SELECT m.id
        FROM ai_chat_messages m
        JOIN ai_chat_sessions s ON s.id = m.session_id
        WHERE m.session_id = $1 AND s.id_user = $2 AND m.type = 'landing_page'
        ORDER BY m.id DESC
        LIMIT 1
      )
    `;
    params = [sessionId, userId, JSON.stringify(updatedData)];
  }

  const { rowCount } = await db.query(queryText, params);
  if (!rowCount) return false;
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return true;
}

export const updateLatestLandingPageMessage = (sessionId, userId, updatedData) =>
  updateLandingPageMessage(sessionId, userId, updatedData, null);


