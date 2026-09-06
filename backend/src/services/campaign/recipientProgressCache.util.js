/**
 * Resolve a row's `updated_at` as epoch microseconds. Prefers the caller-supplied
 * `updatedAtEpochUs` (read straight from PostgreSQL via `EXTRACT(EPOCH FROM ...)`,
 * microsecond precision) and only falls back to `Date.parse(updatedAt)` — which
 * loses everything below one millisecond — for legacy/partial rows that never
 * carried the microsecond field.
 *
 * @param {object|null|undefined} row
 * @returns {number|null}
 */
function resolveUpdatedAtMicros(row) {
  if (!row) return null;
  const explicit = Number(row.updatedAtEpochUs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsedMs = Date.parse(row.updatedAt || '');
  return Number.isFinite(parsedMs) ? parsedMs * 1000 : null;
}

/**
 * Decide whether a newly observed recipient-progress row may replace the
 * process-local cache entry.
 *
 * PostgreSQL remains the source of truth. This guard only prevents an older
 * asynchronous callback from regressing the in-memory view after the database
 * has already arbitrated concurrent writes.
 *
 * @param {object|null|undefined} current
 * @param {object|null|undefined} candidate
 * @returns {boolean}
 */
export function shouldReplaceRecipientProgressCache(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;

  const currentTerminal = Boolean(current.isFullyCompleted);
  const candidateTerminal = Boolean(candidate.isFullyCompleted);
  if (currentTerminal !== candidateTerminal) {
    return candidateTerminal;
  }

  const currentStep = Math.max(0, Number.parseInt(current.lastCompletedStep, 10) || 0);
  const candidateStep = Math.max(0, Number.parseInt(candidate.lastCompletedStep, 10) || 0);
  if (candidateStep !== currentStep) {
    return candidateStep > currentStep;
  }

  const currentUpdatedAt = resolveUpdatedAtMicros(current);
  const candidateUpdatedAt = resolveUpdatedAtMicros(candidate);
  if (currentUpdatedAt !== null && candidateUpdatedAt !== null) {
    // Strictly-greater, not >=: two different transactions committing within the
    // same JS Date millisecond used to tie under ms-only comparison, and an
    // unordered tie previously always accepted the candidate. On a genuine
    // remaining tie, keep `current` — an older callback that resolves its
    // Promise later in the event loop must not be allowed to overwrite meta
    // (nextDueAt/retryCount) written by a callback that actually committed after it.
    return candidateUpdatedAt > currentUpdatedAt;
  }

  // Fallback is used only by legacy/no-table paths where no database timestamp
  // is available. There is no cross-process arbiter in that compatibility mode.
  return currentUpdatedAt === null;
}
