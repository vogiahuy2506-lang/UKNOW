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
    `SELECT id FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
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
  return rows;
}

// Lưu cặp user + assistant message và cập nhật updated_at của session
export async function saveMessages(sessionId, userContent, assistantMsg) {
  await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     VALUES
       ($1, 'user',      $2, NULL, NULL, NULL),
       ($1, 'assistant', $3, $4,   $5,   $6)`,
    [
      sessionId,
      userContent,
      assistantMsg.content ?? '',
      assistantMsg.type ?? null,
      assistantMsg.data != null ? JSON.stringify(assistantMsg.data) : null,
      assistantMsg.missing_fields?.length ? JSON.stringify(assistantMsg.missing_fields) : null,
    ]
  );
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

// Lưu một assistant message duy nhất (không có user message đi kèm)
export async function saveAssistantMessage(sessionId, assistantMsg) {
  await db.query(
    `INSERT INTO ai_chat_messages (session_id, role, content, type, data, missing_fields)
     VALUES ($1, 'assistant', $2, $3, $4, NULL)`,
    [
      sessionId,
      assistantMsg.content ?? '',
      assistantMsg.type ?? null,
      assistantMsg.data != null ? JSON.stringify(assistantMsg.data) : null,
    ]
  );
  await db.query(
    `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

export async function deleteSession(sessionId, userId) {
  const { rowCount } = await db.query(
    `DELETE FROM ai_chat_sessions WHERE id = $1 AND id_user = $2`,
    [sessionId, userId]
  );
  return rowCount > 0;
}
