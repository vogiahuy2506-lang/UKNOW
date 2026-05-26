import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../../../i18n';
import { aggregateToMonthly, formatMonthAxis, formatMonthTooltip } from '../utils/timelineUtils';
import DashboardInsightBlock from './DashboardInsightBlock';
import DashboardRechartsLegend from './DashboardRechartsLegend';

const formatAxisDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

const formatTooltipDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

/** Lines config for "Tổng hợp" tab (combined all channels) */
const SUMMARY_LINES = (t) => [
  { key: 'pendingOrders',   name: t('dashboard.pendingOrders'), color: '#f97316', dash: false },
  { key: 'completedOrders', name: t('dashboard.completedOrders'), color: '#22c55e', dash: false },
];

/**
 * Lines config for "So sánh kênh" tab.
 * Solid lines = pending orders, dashed lines = completed orders.
 * Grouped by channel for clear visual separation.
 */
const COMPARE_LINES = (t) => [
  { key: 'emailPendingOrders',      name: `${t('channel.email')} – ${t('status.pending')}`,      color: '#f97316', dash: false },
  { key: 'emailCompletedOrders',   name: `${t('channel.email')} – ${t('status.completed')}`,     color: '#fb923c', dash: true  },
  { key: 'zaloPendingOrders',      name: `${t('channel.zalo')} – ${t('status.pending')}`,       color: '#2563eb', dash: false },
  { key: 'zaloCompletedOrders',    name: `${t('channel.zalo')} – ${t('status.completed')}`,      color: '#60a5fa', dash: true  },
  { key: 'zaloGroupPendingOrders', name: `${t('channel.zaloGroup')} – ${t('status.pending')}`,  color: '#7c3aed', dash: false },
  { key: 'zaloGroupCompletedOrders',name:`${t('channel.zaloGroup')} – ${t('status.completed')}`, color: '#c084fc', dash: true  },
];

const VIEW_TABS = (t) => [
  { id: 'summary', label: t('dashboard.summary')    },
  { id: 'compare', label: t('dashboard.compareChannels') },
];

/**
 * Custom tooltip for orders chart.
 *
 * - summary mode: list pending + completed total.
 * - compare mode: 3-column layout (Email | Zalo | Zalo Group), each column shows pending + completed.
 *
 * @param {boolean} isMonthlyView - Use month-year label when true
 * @param {string}  viewMode      - 'summary' | 'compare'
 * @param {function} t            - Translation function
 */
const OrdersTooltip = ({ active, payload, label, isMonthlyView, viewMode, t }) => {
  if (!active || !payload?.length) return null;

  const dateLabel = isMonthlyView ? formatMonthTooltip(label) : formatTooltipDate(label);
  const dataMap = Object.fromEntries(payload.map((e) => [e.dataKey, e]));

  /* ── Compare mode: 3-column layout ── */
  if (viewMode === 'compare') {
    const COLS = [
      {
        label: t('channel.email'),
        pending:   { key: 'emailPendingOrders',       label: t('status.pending') },
        completed: { key: 'emailCompletedOrders',      label: t('status.completed') },
      },
      {
        label: t('channel.zalo'),
        pending:   { key: 'zaloPendingOrders',         label: t('status.pending') },
        completed: { key: 'zaloCompletedOrders',        label: t('status.completed') },
      },
      {
        label: t('channel.zaloGroup'),
        pending:   { key: 'zaloGroupPendingOrders',    label: t('status.pending') },
        completed: { key: 'zaloGroupCompletedOrders',  label: t('status.completed') },
      },
    ];

    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-3">{dateLabel}</p>
        <div className="flex divide-x divide-gray-100">
          {COLS.map((col, colIdx) => {
            const pendingEntry   = dataMap[col.pending.key];
            const completedEntry = dataMap[col.completed.key];
            return (
              <div
                key={col.label}
                className={`min-w-[110px] ${colIdx > 0 ? 'pl-3' : ''} ${colIdx < COLS.length - 1 ? 'pr-3' : ''}`}
              >
                <p className="text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                  {col.label}
                </p>
                {[
                  { entry: pendingEntry,   label: col.pending.label   },
                  { entry: completedEntry, label: col.completed.label },
                ].map(({ entry, label: rowLabel }) => (
                  <div key={rowLabel} className="grid grid-cols-[1fr_auto] items-center gap-x-2 py-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: entry?.color || '#d1d5db' }}
                      />
                      <span className="text-xs text-gray-600 whitespace-nowrap">{rowLabel}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900 tabular-nums text-right">
                      {Number(entry?.value || 0).toLocaleString('vi-VN')}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Summary mode: vertical list ── */
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-500 mb-2">{dateLabel}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-xs text-gray-600">{entry.name}</span>
          </div>
          <span className="text-xs font-semibold text-gray-900">
            {Number(entry.value || 0).toLocaleString('vi-VN')}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Dedicated orders trend chart — shows combined pending + completed orders (summary),
 * or per-channel pending + completed breakdown (compare).
 *
 * Tabs: Tổng hợp | So sánh kênh
 * - "Tổng hợp": pendingOrders + completedOrders combined (default)
 * - "So sánh kênh": 6 lines — pending & completed for Email / Zalo / Zalo Group
 *
 * @param {object}  props
 * @param {Array}   props.timeline       - Daily timeline data from analytics API
 * @param {boolean} props.isMonthlyView  - Aggregate to monthly + use month-year axis when true
 * @param {string}  [props.insightText]  - Insight hiển thị dưới biểu đồ
 * @param {boolean} [props.isInsightLoading]
 * @param {string}  [props.insightError]
 * @param {'summary'|'compare'} [props.viewMode] - Tab điều khiển từ ngoài (đồng bộ insight)
 * @param {function} [props.onViewModeChange]
 * @param {'summary'|'compare'|null} [props.lockedViewMode] - Bản in: cố định tab, ẩn nút chuyển
 * @returns {JSX.Element}
 */
const DashboardOrdersChart = ({
  timeline = [],
  isMonthlyView = false,
  insightText = '',
  isInsightLoading = false,
  insightError = '',
  viewMode: viewModeProp,
  onViewModeChange,
  lockedViewMode = null,
}) => {
  const { t } = useI18n();
  const [internalViewMode, setInternalViewMode] = useState('summary');
  const isControlled =
    lockedViewMode == null && viewModeProp != null && typeof onViewModeChange === 'function';
  /** In PDF: khóa tab; màn hình controlled khi có cả viewMode + onViewModeChange */
  const viewMode = lockedViewMode || (isControlled ? viewModeProp : internalViewMode);
  const setViewMode = (id) => {
    if (lockedViewMode) return;
    if (isControlled) onViewModeChange(id);
    else setInternalViewMode(id);
  };

  const chartData   = isMonthlyView ? aggregateToMonthly(timeline) : timeline;
  const activeLines = viewMode === 'compare' ? COMPARE_LINES(t) : SUMMARY_LINES(t);
  const tabs = VIEW_TABS(t);

  const hasData = chartData.some((item) =>
    activeLines.some((line) => (item[line.key] || 0) > 0)
  );

  /* ── Summary badges: totals from combined fields ── */
  const totalPending   = chartData.reduce((sum, item) => sum + (item.pendingOrders   || 0), 0);
  const totalCompleted = chartData.reduce((sum, item) => sum + (item.completedOrders || 0), 0);

  return (
    <div className="card p-5 md:p-6">
      {/* Card header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t('dashboard.ordersOverTime')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {viewMode === 'compare'
              ? t('dashboard.compareOrdersByChannel')
              : t('dashboard.summaryAllChannels')}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* View mode tabs — ẩn khi in PDF (lockedViewMode) */}
          {!lockedViewMode && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-gray-100">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewMode(tab.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === tab.id
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Summary badges */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-100">
              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
              <span className="text-xs font-medium text-orange-700">
                {Number(totalPending).toLocaleString('vi-VN')} {t('dashboard.pendingOrdersBadge')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 border border-green-100">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs font-medium text-green-700">
                {Number(totalCompleted).toLocaleString('vi-VN')} {t('dashboard.completedOrdersBadge')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
          <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">{t('dashboard.noOrderDataInPeriod')}</p>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={isMonthlyView ? formatMonthAxis : formatAxisDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v > 999 ? `${(v / 1000).toFixed(1)}k` : v}
              />
              <Tooltip
                content={
                  <OrdersTooltip isMonthlyView={isMonthlyView} viewMode={viewMode} t={t} />
                }
              />
              <Legend content={DashboardRechartsLegend} wrapperStyle={{ width: '100%' }} />
              {activeLines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={line.dash ? '5 3' : undefined}
                  dot={false}
                  activeDot={{ r: 5, fill: line.color, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <DashboardInsightBlock
        title={t('dashboard.insightOrdersOverTime')}
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
    </div>
  );
};

export default DashboardOrdersChart;
