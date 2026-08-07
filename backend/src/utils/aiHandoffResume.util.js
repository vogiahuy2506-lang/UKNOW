import db from '../config/database.js';

const OWNER_CACHE_TTL_MS = 60_000;

/** @type {Map<number, { value: number|null, expiresAt: number }>} */
const ownerMinutesCache = new Map();

/**
 * Whether AI should remain paused for this conversation.
 * @returns {boolean} true = still paused
 */
export function shouldStayAiPaused({ aiPaused, aiPausedAt, autoResumeMinutes, now = Date.now() }) {
  if (!aiPaused) return false;
  const mins = Number(autoResumeMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return true; // timeout off → stay paused
  if (aiPausedAt == null || aiPausedAt === '') return true;
  const pausedAtMs = new Date(aiPausedAt).getTime();
  // Invalid timestamp → do NOT auto-resume (NaN < x === false would wrongly clear pause)
  if (!Number.isFinite(pausedAtMs)) return true;
  const elapsedMs = now - pausedAtMs;
  return elapsedMs < mins * 60 * 1000;
}

/**
 * Owner handoff auto-resume minutes (cached ~60s). Fail-safe: null on error.
 * @param {number} ownerUserId
 * @returns {Promise<number|null>}
 */
export async function getCachedAutoResumeMinutes(ownerUserId) {
  const id = Number(ownerUserId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const now = Date.now();
  const hit = ownerMinutesCache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;

  try {
    const { rows } = await db.query(
      'SELECT ai_handoff_auto_resume_minutes FROM users WHERE id = $1',
      [id]
    );
    const raw = rows[0]?.ai_handoff_auto_resume_minutes;
    const n = raw == null ? null : Number(raw);
    const minutes = Number.isFinite(n) && n > 0 ? n : null;
    ownerMinutesCache.set(id, { value: minutes, expiresAt: now + OWNER_CACHE_TTL_MS });
    return minutes;
  } catch (err) {
    console.warn('[AiHandoffResume] read minutes failed:', err.message);
    return null;
  }
}

export function invalidateAiHandoffAutoResumeCache(ownerUserId) {
  const id = Number(ownerUserId);
  if (Number.isFinite(id)) ownerMinutesCache.delete(id);
}

/** @internal test helper */
export function _resetAiHandoffAutoResumeCacheForTests() {
  ownerMinutesCache.clear();
}
