import { HiOutlineDatabase } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import useStorageQuota from './useStorageQuota';
import { formatBytes, getStorageAlertLevel } from './storageUtils';

export default function StorageUsageSection({ className = '' }) {
  const { t } = useI18n();
  const { usage, loading } = useStorageQuota();

  if (!usage && loading) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-white p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-2 bg-gray-100 rounded-full w-full" />
      </div>
    );
  }

  if (!usage) return null;

  const usedFormatted = formatBytes(usage.usedBytes);
  const limitFormatted = formatBytes(usage.limitBytes);
  const remainingFormatted = formatBytes(usage.remainingBytes);
  const percent = Math.min(100, Math.max(0, usage.percent || 0));

  const alertLevel = getStorageAlertLevel(usage);
  const isDanger = alertLevel === 'critical';
  const isWarning = alertLevel === 'warning';
  const barColor = isDanger ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-primary-500';
  const textColor = isDanger ? 'text-red-600' : isWarning ? 'text-orange-500' : 'text-gray-700';

  const sourceLabel = usage.source === 'override'
    ? t('storageQuota.sourceOverride')
    : t('storageQuota.sourcePlan');

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HiOutlineDatabase className="w-4 h-4 text-primary-600" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('storageQuota.title')}
          </p>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
          {sourceLabel}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">
            {t('storageQuota.remaining', { remaining: remainingFormatted })}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
            {usedFormatted} / {limitFormatted} ({percent}%)
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
