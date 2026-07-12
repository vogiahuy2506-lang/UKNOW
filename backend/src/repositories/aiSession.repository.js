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
    `SELECT role, content, type, data, missing_fields
     FROM ai_chat_messages
     WHERE session_id = $1
     ORDER BY id ASC`,
    [sessionId]
  );
  return { messages: rows, wizardState: sessions[0].wizard_state || null };
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

// Ghi state theo section từ chat path (gates/meta/plan) bằng jsonb_set.
// Khi KHÔNG có planReset/planSnapshot thì tuyệt đối không đụng section plan —
// tránh clobber plan.savedTemplates do PATCH ghi song song.
// sections = { gates?, meta?, planSnapshot?, planSourcePrompt?, planRequiresApproval?, planReset? }
export async function updateWizardStateSections(sessionId, userId, sections = {}) {
  const base = `COALESCE(wizard_state, '${JSON.stringify({ v: 1, gates: {}, plan: EMPTY_PLAN_SECTION, meta: {} })}'::jsonb)`;
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
export async function saveMessages(sessionId, userId, userContent, assistantMsg) {
  const { rowCount } = await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     SELECT * FROM (VALUES
       ($1::bigint, 'user',      $3::text, NULL::varchar, NULL::jsonb, NULL::jsonb),
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
    ]
  );
  if (!rowCount) return false;
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return true;
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
