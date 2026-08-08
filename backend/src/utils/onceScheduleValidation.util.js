/**
 * Validate one-shot campaign schedule cron expressions.
 *
 * Cron for `once` has no year field, so a past day/month rolls to next year.
 * We reject that rollover, with a grace window so Dec→Jan still works.
 */
import parser from 'cron-parser';

const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Allow next-year fires within this window (NYE / early planning). */
export const ONCE_CRON_NEXT_YEAR_GRACE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * @param {Date} instant
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number }}
 */
function getHanoiParts(instant) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const values = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    year: Number.parseInt(values.year, 10),
    month: Number.parseInt(values.month, 10),
    day: Number.parseInt(values.day, 10),
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
  };
}

/** Instant for a Hanoi wall-clock (VN has no DST). */
function hanoiWallToDate(y, mon, d, h, min) {
  return new Date(Date.UTC(y, mon - 1, d, h - 7, min, 0));
}

/**
 * @param {string} cronExpression five-field cron: m h dom mon dow
 * @returns {{ minute: number, hour: number, day: number, month: number }|null}
 */
function parseOnceCronFields(cronExpression) {
  const parts = String(cronExpression || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 4) return null;
  const minute = Number.parseInt(parts[0], 10);
  const hour = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  const month = Number.parseInt(parts[3], 10);
  if (![minute, hour, day, month].every((n) => Number.isFinite(n))) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { minute, hour, day, month };
}

/**
 * @param {string} cronExpression
 * @param {Date} [now]
 * @returns {{ ok: true, next: Date } | { ok: false, message: string, next?: Date }}
 */
export function assertOnceCronNotYearRolled(cronExpression, now = new Date()) {
  const expr = String(cronExpression || '').trim();
  if (!expr) {
    return { ok: false, message: 'Cron expression không được để trống' };
  }

  const fields = parseOnceCronFields(expr);
  if (!fields) {
    return { ok: false, message: 'Cron expression không hợp lệ cho lịch chạy 1 lần' };
  }

  let next;
  try {
    const interval = parser.parseExpression(expr, {
      currentDate: now,
      tz: HANOI_TIME_ZONE,
    });
    next = interval.next().toDate();
  } catch {
    return { ok: false, message: 'Cron expression không hợp lệ' };
  }

  const nowParts = getHanoiParts(now);
  const thisYearSlot = hanoiWallToDate(
    nowParts.year,
    fields.month,
    fields.day,
    fields.hour,
    fields.minute
  );

  // Still upcoming later this calendar year → OK
  if (thisYearSlot.getTime() > now.getTime()) {
    return { ok: true, next };
  }

  // Slot already passed this year → cron-parser rolls to next year.
  // Allow only a near-term next-year hop (e.g. Dec 31 → Jan 1).
  const deltaMs = next.getTime() - now.getTime();
  if (deltaMs <= ONCE_CRON_NEXT_YEAR_GRACE_MS) {
    return { ok: true, next };
  }

  const nextLabel = new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(next);

  return {
    ok: false,
    next,
    message:
      `Thời điểm này đã qua trong năm nay. Lịch chạy 1 lần không lưu năm nên sẽ chạy vào ${nextLabel}. `
      + 'Hãy chọn ngày giờ trong tương lai.',
  };
}
