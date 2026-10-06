/**
 * Dashboard page header.
 *
 * Shows page title, description, active date range badge,
 * and a button to open the slide-over filter panel.
 *
 * @param {object} props
 * @param {object} props.filters - Applied filters with startDate/endDate
 * @param {function} props.onOpenFilter - Callback to open FilterPanel
 * @param {boolean} props.isLoading
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {string} [props.filterButtonLabel]
 * @param {import('react').ReactNode} [props.extraActions]
 * @returns {JSX.Element}
 */
import { HiOutlineHome } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const DashboardHeader = ({
  icon: Icon = HiOutlineHome,
  filters,
  onOpenFilter,
  isLoading,
  title,
  description,
  filterButtonLabel,
  extraActions = null,
}) => {
  const { t } = useI18n();
  const _title = title || t('dashboard.orders');
  const _description = description || t('dashboard.ordersDescription');
  const _filterLabel = filterButtonLabel || t('common.filter');
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
      {/* Title block */}
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        {Icon && (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20 shrink-0 mt-0.5">
            <Icon className="w-6 h-6" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {_title}
          </h1>
          {_description && (
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
              {_description}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Active date range pill */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-600 shadow-2xs font-medium">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>
            {formatDate(filters?.startDate)} — {formatDate(filters?.endDate)}
          </span>
        </div>

        {/* Filter button */}
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 transition-colors shadow-2xs disabled:opacity-50"
          onClick={onOpenFilter}
          disabled={isLoading}
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
            />
          </svg>
          {_filterLabel}
        </button>
        {extraActions}
      </div>
    </div>
  );
};

export default DashboardHeader;
