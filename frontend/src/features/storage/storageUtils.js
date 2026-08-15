import { MAX_UPLOAD_FILE_MB, MAX_UPLOAD_FILE_BYTES } from '../../constants/uploadLimits';

export { MAX_UPLOAD_FILE_MB, MAX_UPLOAD_FILE_BYTES };

export const CRITICAL_REMAINING_BYTES = 50 * 1024 * 1024; // 50MB
export const WARNING_PERCENT = 80; // >= 80%
export const DANGER_PERCENT = 95; // >= 95%

/**
 * Format bytes to readable string (e.g. 50 MB, 1.5 GB).
 * If value is whole number in unit, omits decimal part.
 */
export function formatBytes(bytes, decimals = 1) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
  if (i === 0) return `${numeric} B`;
  const val = numeric / Math.pow(1024, i);
  const formatted = val % 1 === 0 ? val.toString() : val.toFixed(decimals);
  return `${formatted} ${units[i]}`;
}

/**
 * Evaluate alert level based on quota usage.
 * Combines percentage and adaptive remaining threshold min(50MB, 10% * limit).
 *
 * @param {object|null} usage
 * @returns {'critical' | 'warning' | 'normal' | 'none'}
 */
export function getStorageAlertLevel(usage) {
  if (!usage) return 'none';
  const limit = Number(usage.limitBytes) || 0;
  // Adaptive critical remaining threshold: at most 50MB, or 10% of total limit for smaller plans (e.g. Trial 100MB -> 10MB)
  const criticalThreshold = Math.min(
    CRITICAL_REMAINING_BYTES,
    limit > 0 ? limit * 0.1 : CRITICAL_REMAINING_BYTES
  );

  const isCritical = Boolean(
    usage.overLimit ||
    (typeof usage.percent === 'number' && usage.percent >= DANGER_PERCENT) ||
    (typeof usage.remainingBytes === 'number' && usage.remainingBytes < criticalThreshold)
  );
  if (isCritical) return 'critical';

  const isWarning = Boolean(
    typeof usage.percent === 'number' && usage.percent >= WARNING_PERCENT
  );
  if (isWarning) return 'warning';

  return 'normal';
}
