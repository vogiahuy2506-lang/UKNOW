const DEFER_FAMILIES = [
  {
    untilKey: 'zaloOutboundDeferredUntil',
    reasonKey: 'zaloDeferredReason',
    kind: 'zalo',
  },
  {
    untilKey: 'nonContinuousDeferredUntil',
    reasonKey: 'nonContinuousDeferredReason',
    kind: 'non_continuous',
  },
  {
    untilKey: 'quotaDeferredUntil',
    reasonKey: 'quotaDeferredReason',
    kind: 'plan_quota',
    validate: (reason) => reason.startsWith('plan_quota'),
  },
];

/**
 * Active run pause UI state from campaign run metadata.
 * Evaluates in backend priority order: Zalo -> Non-continuous (SMTP/recipients) -> Quota.
 *
 * @param {object|null|undefined} runMetadata
 * @returns {{ untilIso: string, untilMs: number, reason: string, kind: 'zalo'|'non_continuous'|'plan_quota' }|null}
 */
export function getActiveRunPause(runMetadata) {
  if (!runMetadata || typeof runMetadata !== 'object') return null;

  for (const fam of DEFER_FAMILIES) {
    const rawUntil = runMetadata[fam.untilKey];
    if (!rawUntil) continue;

    const untilMs = Date.parse(String(rawUntil));
    if (!Number.isFinite(untilMs) || untilMs <= Date.now()) continue;

    const reason = String(runMetadata[fam.reasonKey] || '');
    if (fam.validate && !fam.validate(reason)) continue;

    return {
      untilIso: String(rawUntil),
      untilMs,
      reason,
      kind: fam.kind,
    };
  }

  return null;
}

/**
 * Map pause kind or pause object to corresponding i18n translation key.
 *
 * @param {'zalo'|'non_continuous'|'plan_quota'|object|string} pauseOrKind
 * @param {string} [maybeReason]
 * @returns {string}
 */
export function getRunPauseI18nKey(pauseOrKind, maybeReason) {
  const kind = typeof pauseOrKind === 'object' ? pauseOrKind?.kind : pauseOrKind;
  const reason = String(
    (typeof pauseOrKind === 'object' ? pauseOrKind?.reason : maybeReason) || ''
  ).trim();

  if (kind === 'zalo') return 'campaignRun.zaloPausedUntil';
  if (kind === 'non_continuous') {
    if (reason === 'all_recipients_waiting_next_due') {
      return 'campaignRun.waitingNextDueUntil';
    }
    if (reason.toLowerCase().includes('smtp')) {
      return 'campaignRun.smtpPausedUntil';
    }
    return 'campaignRun.genericPausedUntil';
  }
  return 'campaignRun.quotaPausedUntil';
}

/**
 * Active plan-quota pause UI state from campaign run metadata.
 * Backward compatibility helper: only returns when kind === 'plan_quota' and reason starts with plan_quota.
 *
 * @param {object|null|undefined} runMetadata
 * @returns {{ untilIso: string, untilMs: number, reason: string }|null}
 */
export function getActivePlanQuotaPause(runMetadata) {
  const pause = getActiveRunPause(runMetadata);
  if (!pause || pause.kind !== 'plan_quota' || !pause.reason.startsWith('plan_quota')) {
    return null;
  }

  return {
    untilIso: pause.untilIso,
    untilMs: pause.untilMs,
    reason: pause.reason,
  };
}

