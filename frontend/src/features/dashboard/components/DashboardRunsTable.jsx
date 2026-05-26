import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';

const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getStatusConfig = (status, t) => {
  const STATUS_CONFIG = {
    completed: { cls: 'badge-success', label: t('runsTable.completed') },
    running: { cls: 'badge-info', label: t('runsTable.running') },
    pending: { cls: 'badge-warning', label: t('runsTable.pending') },
    failed: { cls: 'badge-error', label: t('runsTable.failed') },
    cancelled: { cls: 'badge-gray', label: t('runsTable.cancelled') },
  };
  return STATUS_CONFIG[String(status || '').toLowerCase()] || { cls: 'badge-gray', label: status || '—' };
};

const getChannelConfig = (type, t) => {
  const CHANNEL_CONFIG = {
    email: { cls: 'bg-sky-100 text-sky-700', label: t('channel.email') },
    zalo: { cls: 'bg-blue-100 text-blue-700', label: t('channel.zalo') },
    zalo_group: { cls: 'bg-purple-100 text-purple-700', label: t('channel.zaloGroup') },
  };
  return CHANNEL_CONFIG[String(type || '').toLowerCase()] || { cls: 'bg-gray-100 text-gray-700', label: type || '—' };
};

// ─── Sort icon ────────────────────────────────────────────────────────────────
const SortIcon = ({ column, sortConfig }) => {
  const isActive = sortConfig.key === column;
  return (
    <span className={`ml-1 inline-flex flex-col gap-[1px] ${isActive ? 'opacity-100' : 'opacity-30'}`}>
      <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'asc' ? 'text-primary-500' : 'text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0L5 0z" /></svg>
      <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'desc' ? 'text-primary-500' : 'text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10L5 6z" /></svg>
    </span>
  );
};

// ─── Funnel icon (for filter indicator) ──────────────────────────────────────
const FunnelIcon = ({ active }) => (
  <svg
    className={`w-3 h-3 ml-1 shrink-0 ${active ? 'text-primary-500 fill-primary-500' : 'text-gray-400 fill-none'}`}
    viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1.586a1 1 0 01-.293.707l-4.414 4.414a1 1 0 00-.293.707V15a1 1 0 01-.553.894l-3 1.5A1 1 0 017 16.5v-5.086a1 1 0 00-.293-.707L2.293 6.293A1 1 0 012 5.586V4z" />
  </svg>
);

// ─── Generic column filter dropdown ──────────────────────────────────────────
/**
 * Dropdown checkbox filter for a table column header.
 *
 * @param {object} props
 * @param {Array<{value: string, label: string}>} props.options
 * @param {string[]} props.selected - selected values (empty = all)
 * @param {function(string[]): void} props.onChange
 * @param {string} props.label - column label
 * @param {function} props.onSort - callback to trigger sort
 * @param {string} props.sortColumn
 * @param {object} props.sortConfig
 * @returns {JSX.Element}
 */
const FilterableTh = ({ options, selected, onChange, label, onSort, sortColumn, sortConfig, t: tFunc }) => {
  const { t } = useI18n();
  const translate = tFunc || t;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isFiltered = selected.length > 0;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = options.every((opt) => selected.includes(opt.value));

  const toggleOption = (value) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));

  return (
    <th
      className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b whitespace-nowrap"
      ref={ref}
    >
      <div className="flex items-center gap-0.5">
        {/* Sort trigger */}
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-gray-700 cursor-pointer select-none"
          onClick={() => onSort && onSort(sortColumn)}
        >
          {label}
          {sortColumn && <SortIcon column={sortColumn} sortConfig={sortConfig} />}
        </button>

        {/* Filter trigger */}
        <button
          type="button"
          className={`p-0.5 rounded transition-colors ${open ? 'bg-primary-50' : 'hover:bg-gray-100'}`}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          title={`${t('runsTable.channel')}: ${label}`}
        >
          <FunnelIcon active={isFiltered} />
        </button>

        {/* Active filter badge */}
        {isFiltered && (
          <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] font-bold">
            {selected.length}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute mt-1 min-w-[160px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
          {/* Select all row */}
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                checked={selected.length === 0}
                onChange={toggleAll}
              />
              <span className="text-xs font-medium text-gray-500">{translate('ordersTable.all')}</span>
            </label>
          </div>
          {/* Options */}
          <div className="py-1">
            {options.map((opt) => (
              <label key={opt.value} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${selected.includes(opt.value) ? 'bg-primary-50/60' : ''}`}>
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer shrink-0"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleOption(opt.value)}
                />
                {opt.badge ? (
                  <span className={`badge text-[10px] px-1.5 py-0 ${opt.badge}`}>{opt.label}</span>
                ) : (
                  <span className="text-xs text-gray-700">{opt.label}</span>
                )}
              </label>
            ))}
          </div>
          {/* Clear */}
          {isFiltered && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60">
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
                onClick={() => { onChange([]); setOpen(false); }}
              >
                {translate('ordersTable.clearFilter')}
              </button>
            </div>
          )}
        </div>
      )}
    </th>
  );
};

// ─── "Đơn đặt" header with sort-mode picker ──────────────────────────────────
/**
 * Order column header: sort by completed or pending orders.
 *
 * @param {object} props
 * @param {string} props.orderSortKey - 'completedOrderCount' | 'pendingOrderCount'
 * @param {function(string): void} props.onChangeSortKey
 * @param {function(string): void} props.onSort
 * @param {object} props.sortConfig
 * @param {Array} props.orderSortOptions - ORDER_SORT_OPTIONS from parent
 * @returns {JSX.Element}
 */
const OrderSortTh = ({ orderSortKey, onChangeSortKey, onSort, sortConfig, t: tFunc, orderSortOptions = [] }) => {
  const { t } = useI18n();
  const translate = tFunc || t;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ORDER_SORT_OPTIONS = orderSortOptions;
  const activeMeta = ORDER_SORT_OPTIONS.find((o) => o.key === orderSortKey) || ORDER_SORT_OPTIONS[0];

  return (
    <th
      className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b whitespace-nowrap"
      ref={ref}
    >
      <div className="flex flex-col items-start gap-1">
        {/* Sort trigger */}
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-gray-700 select-none shrink-0 whitespace-nowrap"
          onClick={() => onSort(orderSortKey)}
        >
          <span>{translate('runsTable.orders')}</span>
          <SortIcon column={orderSortKey} sortConfig={sortConfig} />
        </button>

        {/* Mode picker trigger */}
        <button
          type="button"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-base shrink-0 whitespace-nowrap ${
            orderSortKey === 'completedOrderCount'
              ? 'bg-green-50 border-green-200 text-green-600'
              : 'bg-orange-50 border-orange-200 text-orange-500'
          } ${open ? 'ring-1 ring-offset-0 ring-primary-300' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={translate('runsTable.selectSortType')}
        >
          {activeMeta.label}
          <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute mt-1 min-w-[148px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden py-1">
          {(ORDER_SORT_OPTIONS || []).map((opt, idx) => (
            <button
              key={opt.key}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                orderSortKey === opt.key ? 'bg-primary-50' : ''
              }`}
              onClick={() => { onChangeSortKey(opt.key); onSort(opt.key); setOpen(false); }}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${
                idx === 0 ? 'bg-green-500' : 'bg-orange-400'
              }`}>
                {idx + 1}
              </span>
              <span className={`font-medium ${opt.color}`}>{opt.label}</span>
              {orderSortKey === opt.key && (
                <svg className="w-3 h-3 text-primary-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </th>
  );
};

// ─── Skeleton / Empty ─────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className="px-4 py-3 border-b border-gray-100">
        <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: i === 0 ? '80%' : '55%' }} />
        {i === 0 && <div className="h-2.5 bg-gray-100 rounded animate-pulse mt-1.5 w-2/3" />}
      </td>
    ))}
  </tr>
);

const EmptyState = ({ hasFilter }) => {
  const { t } = useI18n();
  return (
    <tr>
      <td colSpan={8} className="py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-14 h-14 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium text-gray-500">
            {hasFilter ? t('runsTable.noResultsFilter') : t('runsTable.noRunsInRange')}
          </p>
          <p className="text-xs text-gray-400">
            {hasFilter ? t('runsTable.tryClearFilter') : t('runsTable.adjustTimeCampaign')}
          </p>
        </div>
      </td>
    </tr>
  );
};

/**
 * Hiển thị text rút gọn bằng dấu `...` và cho phép bấm để bung toàn bộ xuống dòng.
 *
 * Luồng hoạt động:
 * 1. Nếu chuỗi ngắn hơn ngưỡng, hiển thị bình thường và không có nút thao tác.
 * 2. Nếu chuỗi dài hơn ngưỡng, mặc định rút gọn 1 dòng có ellipsis.
 * 3. Khi người dùng bấm, chuyển sang trạng thái bung toàn bộ và cho phép xuống dòng.
 *
 * @param {object} props - Thuộc tính hiển thị text.
 * @param {string} props.value - Nội dung cần hiển thị.
 * @param {number} [props.maxPreviewChars=72] - Ngưỡng ký tự để bật chế độ rút gọn.
 * @param {string} [props.className=''] - CSS class bổ sung cho text.
 * @returns {JSX.Element}
 */
const ExpandableCellText = ({ value, maxPreviewChars = 72, className = '', t: tFunc }) => {
  const { t } = useI18n();
  const translate = tFunc || t;
  const [expanded, setExpanded] = useState(false);
  const safeValue = String(value || '');
  const canExpand = safeValue.length > maxPreviewChars;

  if (!safeValue) {
    return <span className={className}>-</span>;
  }

  return (
    <div className="max-w-[340px]">
      <p
        className={`${className} ${
          expanded ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'
        }`}
        title={canExpand && !expanded ? safeValue : undefined}
      >
        {safeValue}
      </p>
      {canExpand && (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-medium text-primary-500 hover:text-primary-600 transition-colors"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? translate('runsTable.viewLess') : translate('runsTable.viewMore')}
        </button>
      )}
    </div>
  );
};

// NOTE: CHANNEL_FILTER_OPTIONS and STATUS_FILTER_OPTIONS are defined inside the main component

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Run-level metrics table.
 *
 * Features:
 * - Text search by campaign/run name
 * - Column sort (click header)
 * - Column filter dropdowns for "Kênh" and "Trạng thái"
 * - "Tin đã gửi" = số sự kiện email_sent / zalo_sent trên customer_journey (theo kênh)
 * - "Email mở" / "Click" = tổng bản ghi email_opened / email_clicked + zalo_clicked trên hành trình
 * - "Đơn đặt" từ customer_purchases; có thể sắp xếp theo Đã đặt / Chờ xử lý
 * - Loading skeleton & empty state
 *
 * @param {object} props
 * @param {object} props.runsData - { items, pagination }
 * @param {boolean} props.isLoadingRuns
 * @param {function} props.onChangePage
 * @returns {JSX.Element}
 */
const DashboardRunsTable = ({ runsData, isLoadingRuns, onChangePage }) => {
  const { t } = useI18n();
  const items = useMemo(() => runsData?.items || [], [runsData?.items]);
  const pagination = runsData?.pagination || { page: 1, totalPages: 1, total: 0 };

  const STATUS_CONFIG = {
    completed: { cls: 'badge-success', label: t('runsTable.completed') },
    running: { cls: 'badge-info', label: t('runsTable.running') },
    pending: { cls: 'badge-warning', label: t('runsTable.pending') },
    failed: { cls: 'badge-error', label: t('runsTable.failed') },
    cancelled: { cls: 'badge-gray', label: t('runsTable.cancelled') },
  };

  const CHANNEL_CONFIG = {
    email: { cls: 'bg-sky-100 text-sky-700', label: t('channel.email') },
    zalo: { cls: 'bg-blue-100 text-blue-700', label: t('channel.zalo') },
    zalo_group: { cls: 'bg-purple-100 text-purple-700', label: t('channel.zaloGroup') },
  };

  const ORDER_SORT_OPTIONS = [
    { key: 'completedOrderCount', label: t('runsTable.ordered'), color: 'text-green-600' },
    { key: 'pendingOrderCount', label: t('runsTable.pendingOrders'), color: 'text-orange-500' },
  ];

  const STATUS_FILTER_OPTIONS = [
    { value: 'completed', label: t('runsTable.completed'), badge: 'bg-green-100 text-green-700' },
    { value: 'running',   label: t('runsTable.running'),    badge: 'bg-blue-100 text-blue-700' },
    { value: 'pending',   label: t('runsTable.pending'),    badge: 'bg-yellow-100 text-yellow-700' },
    { value: 'failed',    label: t('runsTable.failed'),     badge: 'bg-red-100 text-red-700' },
    { value: 'cancelled', label: t('runsTable.cancelled'),  badge: 'bg-gray-100 text-gray-600' },
  ];

  const CHANNEL_FILTER_OPTIONS = [
    { value: 'email',      label: t('channel.email'),      badge: 'bg-sky-100 text-sky-700' },
    { value: 'zalo',       label: t('channel.zalo'),       badge: 'bg-blue-100 text-blue-700' },
    { value: 'zalo_group', label: t('channel.zaloGroup'),  badge: 'bg-purple-100 text-purple-700' },
  ];

  const [searchQuery, setSearchQuery]     = useState('');
  const [sortConfig, setSortConfig]       = useState({ key: 'startedAt', direction: 'desc' });
  const [channelFilters, setChannelFilters] = useState([]);
  const [statusFilters, setStatusFilters]   = useState([]);
  const [orderSortKey, setOrderSortKey]     = useState('completedOrderCount');

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const isAnyFilter = Boolean(searchQuery.trim()) || channelFilters.length > 0 || statusFilters.length > 0;

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // Pre-compute combined click count so sort uses the same value as the displayed cell
    let result = items.map((item) => ({
      ...item,
      totalClickCount: (item.emailClickedCount || 0) + (item.zaloClickCount || 0),
    }));

    if (q) {
      result = result.filter(
        (item) =>
          (item.campaignName || '').toLowerCase().includes(q) ||
          (item.runName || '').toLowerCase().includes(q)
      );
    }
    if (channelFilters.length > 0) {
      result = result.filter((item) => channelFilters.includes(String(item.campaignType || '').toLowerCase()));
    }
    if (statusFilters.length > 0) {
      result = result.filter((item) => statusFilters.includes(String(item.status || '').toLowerCase()));
    }

    return [...result].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA = a[key];
      let valB = b[key];

      if (key === 'startedAt') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }

      return direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [items, searchQuery, channelFilters, statusFilters, sortConfig]);

  // Sortable plain <th>
  const SortTh = ({ column, children }) => (
    <th
      className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap"
      onClick={() => handleSort(column)}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        <SortIcon column={column} sortConfig={sortConfig} />
      </span>
    </th>
  );

  return (
    <div className="card">
      {/* Card header */}
      <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t('runsTable.title')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatNumber(pagination.total)} {t('runsTable.runs')}
            {filteredAndSorted.length !== items.length && (
              <span className="ml-1 text-primary-500 font-medium">
                {t('runsTable.showingResults', { count: filteredAndSorted.length })}
              </span>
            )}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="input text-sm"
            style={{ paddingLeft: '2.25rem' }}
            placeholder={t('runsTable.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container relative">
        <table className="table">
          <thead>
            <tr>
              {/* Run / Campaign */}
              <th className="px-4 py-3 text-left font-medium text-gray-500 bg-gray-50 border-b min-w-[200px]">
                {t('runsTable.runCampaign')}
              </th>

              {/* Channel — filterable */}
              <FilterableTh
                label={t('runsTable.channel')}
                options={CHANNEL_FILTER_OPTIONS}
                selected={channelFilters}
                onChange={setChannelFilters}
                sortColumn={null}
                sortConfig={sortConfig}
                t={t}
              />

              {/* Start Date */}
              <SortTh column="startedAt">{t('runsTable.startDate')}</SortTh>

              {/* Messages Sent: count email_sent / zalo_sent events on customer_journey */}
              <SortTh column="journeySentCount">{t('runsTable.messagesSent')}</SortTh>

              {/* Email Opened */}
              <SortTh column="emailOpenedCount">{t('runsTable.emailOpened')}</SortTh>

              {/* Click — sort by combined email + zalo clicks */}
              <SortTh column="totalClickCount">{t('runsTable.click')}</SortTh>

              {/* Orders — with sort mode picker */}
              <OrderSortTh
                orderSortKey={orderSortKey}
                onChangeSortKey={(key) => { setOrderSortKey(key); }}
                onSort={handleSort}
                sortConfig={sortConfig}
                t={t}
                orderSortOptions={ORDER_SORT_OPTIONS}
              />

              {/* Status — filterable */}
              <FilterableTh
                label={t('runsTable.status')}
                options={STATUS_FILTER_OPTIONS}
                selected={statusFilters}
                onChange={setStatusFilters}
                sortColumn={null}
                sortConfig={sortConfig}
                t={t}
              />
            </tr>
          </thead>
          <tbody>
            {isLoadingRuns
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : filteredAndSorted.length === 0
              ? <EmptyState hasFilter={isAnyFilter} />
              : filteredAndSorted.map((item) => {
                  const statusCfg = getStatusConfig(item.status, t);
                  const channelCfg = getChannelConfig(item.campaignType, t);

                  return (
                    <tr key={item.runId} className="hover:bg-gray-50/80 transition-colors">
                      {/* Run name + campaign */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <ExpandableCellText
                          value={item.runName}
                          maxPreviewChars={78}
                          className="font-medium text-gray-900 text-sm leading-snug"
                        />
                        <div className="mt-0.5">
                          <ExpandableCellText
                            value={item.campaignName}
                            maxPreviewChars={64}
                            className="text-xs text-gray-400"
                          />
                        </div>
                      </td>

                      {/* Channel */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={`badge ${channelCfg.cls} text-xs`}>{channelCfg.label}</span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(item.startedAt)}
                      </td>

                      {/* Số tin đã gửi theo hành trình */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-gray-700 text-right tabular-nums">
                        <span className="font-medium">{formatNumber(item.journeySentCount ?? 0)}</span>
                      </td>

                      {/* Email open */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-gray-700 text-right tabular-nums">
                        {formatNumber(item.emailOpenedCount)}
                      </td>

                      {/* Click */}
                      <td className="px-4 py-3 border-b border-gray-100 text-sm text-gray-700 text-right tabular-nums">
                        {formatNumber((item.emailClickedCount || 0) + (item.zaloClickCount || 0))}
                      </td>

                      {/* Orders */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="flex flex-col gap-0.5 text-xs tabular-nums">
                          <span className={`font-semibold ${orderSortKey === 'completedOrderCount' ? 'text-green-600' : 'text-green-500'}`}>
                            {formatNumber(item.completedOrderCount)} {t('runsTable.ordered')}
                          </span>
                          <span className={`${orderSortKey === 'pendingOrderCount' ? 'text-orange-500 font-semibold' : 'text-orange-400'}`}>
                            {formatNumber(item.pendingOrderCount)} {t('runsTable.pendingOrders')}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={`badge ${statusCfg.cls}`}>{statusCfg.label}</span>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 md:p-5 border-t border-gray-100 flex items-center justify-between bg-gray-50/40">
        <button type="button"
          className="btn btn-secondary flex items-center gap-1.5 text-sm"
          disabled={isLoadingRuns || pagination.page <= 1}
          onClick={() => onChangePage(pagination.page - 1)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('runsTable.previousPage')}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500">{t('runsTable.page')}</span>
          <span className="text-sm font-semibold text-gray-900">{pagination.page}</span>
          <span className="text-sm text-gray-400">/</span>
          <span className="text-sm text-gray-500">{pagination.totalPages}</span>
        </div>

        <button type="button"
          className="btn btn-secondary flex items-center gap-1.5 text-sm"
          disabled={isLoadingRuns || pagination.page >= pagination.totalPages}
          onClick={() => onChangePage(pagination.page + 1)}>
          {t('runsTable.nextPage')}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DashboardRunsTable;
