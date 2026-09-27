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
      ...(fam.kind === 'zalo'
        ? { accountName: runMetadata.zaloDeferredAccountName || null }
        : {}),
      // PR-8b (UI nói thật) Việc 5 — dấu hiệu THẬT để nhận biết đang chờ do SMTP rate-limit (12h),
      // khác với "đang chờ tới hạn gửi bước sau" thông thường (cùng dùng chung reason
      // 'all_recipients_waiting_next_due'). Xem campaignRun.service.js:4014.
      ...(fam.kind === 'non_continuous'
        ? { emailRateLimitAt: runMetadata.emailRateLimitAt || null }
        : {}),
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
// Khung chặn SMTP rate-limit ở backend (campaignRun.service.js EMAIL_RATE_LIMIT_PAUSE_MS = 12h) + 1h dư.
const SMTP_RATE_LIMIT_PAUSE_WINDOW_MS = 13 * 60 * 60 * 1000;

/**
 * Review PR-8b — `emailRateLimitAt` ghi MỘT lần mỗi lượt và KHÔNG bao giờ xoá. Chỉ "có" thì một lượt
 * từng bị chặn 1 lần sẽ mãi hiện "Máy chủ email tạm chặn" kể cả khi sau đó chỉ chờ bước kế theo lịch
 * (vài ngày). Chỉ coi là chặn SMTP khi mốc chờ nằm trong khung 12h tính từ lúc bị chặn.
 *
 * @param {string|null|undefined} emailRateLimitAt
 * @param {number|null|undefined} untilMs
 * @returns {boolean}
 */
function isSmtpRateLimitPause(emailRateLimitAt, untilMs) {
  const limitedAtMs = Date.parse(String(emailRateLimitAt || ''));
  if (!Number.isFinite(limitedAtMs) || !Number.isFinite(untilMs)) return false;
  return untilMs > limitedAtMs && untilMs - limitedAtMs <= SMTP_RATE_LIMIT_PAUSE_WINDOW_MS;
}

export function getRunPauseI18nKey(pauseOrKind, maybeReason) {
  const kind = typeof pauseOrKind === 'object' ? pauseOrKind?.kind : pauseOrKind;
  const reason = String(
    (typeof pauseOrKind === 'object' ? pauseOrKind?.reason : maybeReason) || ''
  ).trim();
  const emailRateLimitAt = typeof pauseOrKind === 'object' ? pauseOrKind?.emailRateLimitAt : null;

  if (kind === 'zalo') {
    if (
      reason === 'phone_lookup_cooldown'
      || reason === 'phone_lookup_cooldown_api_error'
      || reason === 'all_accounts_phone_lookup_cooldown'
    ) {
      return 'campaignRun.zaloPhoneLookupPausedUntil';
    }
    if (reason === 'quiet_hours') {
      return 'campaignRun.zaloQuietHoursUntil';
    }
    if (reason === 'rate_limited') {
      return 'campaignRun.zaloRateLimitedUntil';
    }
    return 'campaignRun.zaloPausedUntil';
  }
  if (kind === 'non_continuous') {
    // PR-8b (UI nói thật) Việc 5 — nhánh includes('smtp') CŨ chết thật: backend không bao giờ ghi
    // reason chứa chuỗi "smtp" cho non_continuous (chỉ 'all_recipients_waiting_next_due' hoặc
    // 'scheduled_step_*'). Dấu hiệu THẬT để phân biệt "đang chờ do SMTP rate-limit 12h" với "đang
    // chờ tới hạn gửi bước sau" thông thường là run_metadata.emailRateLimitAt (campaignRun.service.js
    // :4014) — kiểm TRƯỚC vì cùng dùng chung reason 'all_recipients_waiting_next_due'.
    if (isSmtpRateLimitPause(emailRateLimitAt, typeof pauseOrKind === 'object' ? pauseOrKind?.untilMs : null)) {
      return 'campaignRun.smtpPausedUntil';
    }
    if (reason === 'all_recipients_waiting_next_due') {
      return 'campaignRun.waitingNextDueUntil';
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

