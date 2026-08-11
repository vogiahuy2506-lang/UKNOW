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
 * ISO deadline for lazy auto-resume countdown, or null when no clock
 * (AI on, manual pause with null aiPausedAt, or auto-resume setting off).
 * Manual pause encoding: aiPaused && !aiPausedAt.
 */
export function computeAiResumeAt({ aiPaused, aiPausedAt, autoResumeMinutes }) {
  if (!aiPaused || aiPausedAt == null || aiPausedAt === '') return null;
  const mins = Number(autoResumeMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const pausedAtMs = new Date(aiPausedAt).getTime();
  if (!Number.isFinite(pausedAtMs)) return null;
  return new Date(pausedAtMs + mins * 60_000).toISOString();
}

function normalizeAiPausedAt(value) {
  if (value == null || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Pause fields for API / SSE — shared by unified inbox send + isSelf handoff broadcast.
 * @param {{ aiPaused: boolean, aiPausedAt?: string|null, ownerUserId: number }} args
 * @returns {Promise<{ aiPaused: boolean, aiPausedAt: string|null, aiResumeAt: string|null }>}
 */
export async function buildAiPausePayload({ aiPaused, aiPausedAt, ownerUserId }) {
  const paused = aiPaused === true;
  const pausedAt = paused ? normalizeAiPausedAt(aiPausedAt) : null;
  const minutes = paused && pausedAt
    ? await getCachedAutoResumeMinutes(ownerUserId)
    : null;
  return {
    aiPaused: paused,
    aiPausedAt: pausedAt,
    aiResumeAt: computeAiResumeAt({
      aiPaused: paused,
      aiPausedAt: pausedAt,
      autoResumeMinutes: minutes,
    }),
  };
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
