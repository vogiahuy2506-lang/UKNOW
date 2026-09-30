import { isUnlimitedPlanLimit } from '../../utils/subscriptionStatus.util.js';

const formatNumber = (value) => Number(value).toLocaleString('vi-VN');

/**
 * Single usage row with a progress bar.
 *
 * `used` null/undefined = đồng hồ KHÔNG đọc được (backend trả null khi phép đếm lỗi) → hiện "—", tuyệt đối không
 * hiện "0 / N" như thể khách chưa dùng gì.
 */
export default function UsageBar({
  icon: Icon,
  label,
  used,
  limit,
  t,
  serviceSuspended = false,
  usingAddons = false,
}) {
  if (serviceSuspended) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className="text-xs font-semibold text-red-600">
          {t('accountProfileModal.suspended')}
        </span>
      </div>
    );
  }

  const usedNumber = used === null || used === undefined || used === '' ? NaN : Number(used);
  if (!Number.isFinite(usedNumber)) {
    return (
      <div className="flex items-center justify-between py-1" data-testid="usage-bar-unavailable">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span
          className="text-xs font-medium text-gray-400"
          title={t('accountProfileModal.meterUnavailable')}
        >
          —
        </span>
      </div>
    );
  }

  if (isUnlimitedPlanLimit(limit)) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className="text-xs font-medium text-gray-400">
          {usedNumber > 0
            ? `${formatNumber(usedNumber)} · ${t('accountProfileModal.unlimited')}`
            : t('accountProfileModal.unlimited')}
        </span>
      </div>
    );
  }

  const limitNumber = Number(limit);
  const pct = limitNumber > 0 ? Math.min(100, Math.round((usedNumber / limitNumber) * 100)) : 0;
  const isDanger = pct >= 95;
  const isWarning = pct >= 80;
  const barColor = isDanger ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-primary-500';
  const textColor = isDanger ? 'text-red-600' : isWarning ? 'text-orange-500' : 'text-gray-700';
  const showAddonsHint = usingAddons && usedNumber > limitNumber;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
          {formatNumber(usedNumber)} / {formatNumber(limitNumber)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {showAddonsHint && (
        <p className="mt-0.5 text-[11px] text-amber-700">
          {t('accountProfileModal.usingAddonsHint')}
        </p>
      )}
    </div>
  );
}
