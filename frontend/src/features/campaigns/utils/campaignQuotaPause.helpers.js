/**
 * Active plan-quota pause UI state from campaign run metadata.
 * Only when reason is plan_quota* AND until is still in the future.
 *
 * @param {object|null|undefined} runMetadata
 * @returns {{ untilIso: string, untilMs: number, reason: string }|null}
 */
export function getActivePlanQuotaPause(runMetadata) {
  const reason = String(runMetadata?.quotaDeferredReason || '');
  if (!reason.startsWith('plan_quota')) return null;

  const untilIso = runMetadata?.quotaDeferredUntil;
  const untilMs = Date.parse(String(untilIso || ''));
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) return null;

  return {
    untilIso: String(untilIso),
    untilMs,
    reason,
  };
}
