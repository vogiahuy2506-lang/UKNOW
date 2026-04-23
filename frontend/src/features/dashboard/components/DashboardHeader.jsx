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
const DashboardHeader = ({
  filters,
  onOpenFilter,
  isLoading,
  title = 'Campaign Dashboard',
  description = 'Phân tích hiệu quả theo lượt chạy, kênh giao tiếp và trạng thái đơn hàng',
  filterButtonLabel = 'Bộ lọc',
  extraActions = null,
}) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      {/* Title block */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Active date range pill */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 shadow-sm">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="font-medium">
            {formatDate(filters?.startDate)} — {formatDate(filters?.endDate)}
          </span>
        </div>

        {/* Filter button */}
        <button
          type="button"
          className="btn btn-secondary flex items-center gap-2 shadow-sm"
          onClick={onOpenFilter}
          disabled={isLoading}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
            />
          </svg>
          {filterButtonLabel}
        </button>
        {extraActions}
      </div>
    </div>
  );
};

export default DashboardHeader;
