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
      <div className="flex items-center justify-between py-2 px-1">
        <span className="flex items-center gap-2 text-sm text-gray-600">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="font-medium">{label}</span>
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-red-700 bg-red-50 border border-red-200">
          {t('accountProfileModal.suspended')}
        </span>
      </div>
    );
  }

  const usedNumber = used === null || used === undefined || used === '' ? NaN : Number(used);
  if (!Number.isFinite(usedNumber)) {
    return (
      <div className="flex items-center justify-between py-2 px-1" data-testid="usage-bar-unavailable">
        <span className="flex items-center gap-2 text-sm text-gray-600">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="font-medium">{label}</span>
        </span>
        <span
          className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-100"
          title={t('accountProfileModal.meterUnavailable')}
        >
          —
        </span>
      </div>
    );
  }

  if (isUnlimitedPlanLimit(limit)) {
    return (
      <div className="flex items-center justify-between py-2 px-1.5 hover:bg-gray-50/70 rounded-lg transition-colors">
        <span className="flex items-center gap-2 text-sm text-gray-700">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="font-medium">{label}</span>
        </span>
        <span
          className="inline-flex items-center text-xs font-medium text-gray-600 bg-gray-100/90 hover:bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200/70 transition-colors cursor-default"
          title={
            usedNumber > 0
              ? `Đang sử dụng: ${formatNumber(usedNumber)} · Hạn mức: ${t('accountProfileModal.unlimited')}`
              : `Hạn mức: ${t('accountProfileModal.unlimited')}`
          }
        >
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
    <div className="py-1 px-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-2 text-sm text-gray-700">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="font-medium">{label}</span>
        </span>
        <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
          {formatNumber(usedNumber)} / {formatNumber(limitNumber)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden shadow-inner">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {showAddonsHint && (
        <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1 font-medium">
          <span>•</span> {t('accountProfileModal.usingAddonsHint')}
        </p>
      )}
    </div>
  );
}
