import { useMemo } from 'react';
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

const CHANNEL_TAB_STYLES = {
  gray: 'bg-gray-700 text-white border-gray-700',
  sky: 'bg-sky-500 text-white border-sky-500',
  blue: 'bg-blue-500 text-white border-blue-500',
  purple: 'bg-purple-500 text-white border-purple-500',
};

const formatAxisDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

const formatTooltipDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

/** Pick the right axis/tooltip formatter based on view mode */
const getAxisFormatter = (isMonthlyView) => isMonthlyView ? formatMonthAxis : formatAxisDate;
const getTooltipLabel = (label, isMonthlyView) =>
  isMonthlyView ? formatMonthTooltip(label) : formatTooltipDate(label);

/**
 * Map each derived metric to the "Gửi" key it should be compared against
 * for ratio calculation. Keys not listed here are treated as base metrics (no ratio).
 */
const RATIO_DENOMINATOR = {
  emailOpened: 'emailSent',
  emailClicked: 'emailSent',
  emailDownloads: 'emailSent',
  emailPendingOrders: 'emailSent',
  emailCompletedOrders: 'emailSent',
  zaloClicks: 'zaloSent',
  zaloPendingOrders: 'zaloSent',
  zaloCompletedOrders: 'zaloSent',
  zaloGroupClicks: 'zaloGroupSent',
  zaloGroupPendingOrders: 'zaloGroupSent',
  zaloGroupCompletedOrders: 'zaloGroupSent',
};

/**
 * Row-aligned layout for "Tất cả" tab.
 * Each row entry defines which dataKey belongs to each channel at the SAME row index,
 * so metrics align horizontally across columns (null = empty spacer row).
 *
 *  Row 1 → Gửi      (Email | Zalo | Zalo Group)
 *  Row 2 → Mở       (Email only)
 *  Row 3 → Click     (Email | Zalo | Zalo Group)
 *  Row 4 → Tải tệp  (Email only)
 */
const TOOLTIP_METRIC_ROWS = [
  { email: 'emailSent',      zalo: 'zaloSent',   zaloGroup: 'zaloGroupSent'  },
  { email: 'emailOpened',    zalo: null,          zaloGroup: null             },
  { email: 'emailClicked',   zalo: 'zaloClicks',  zaloGroup: 'zaloGroupClicks'},
  { email: 'emailDownloads', zalo: null,          zaloGroup: null             },
];

/** Strip the " (Channel)" suffix for compact column display */
const stripChannelSuffix = (name) => name.replace(/\s*\([^)]*\)\s*$/, '');

/** Compute percentage ratio (rounded), returns null when denominator is 0 */
const calcRatio = (value, sent) =>
  sent > 0 ? `${Math.round((value / sent) * 100)}%` : null;

/**
 * Custom tooltip showing all line values for current date.
 * - Single-channel view: vertical list with ratio annotation beside each metric.
 * - "Tất cả" view: 3-column layout (Email | Zalo | Zalo Group) for side-by-side comparison.
 *
 * @param {object}  props
 * @param {boolean} props.active
 * @param {Array}   props.payload
 * @param {string}  props.label
 * @param {string}  props.activeChannel
 * @param {boolean} props.isMonthlyView
 * @param {object}  props.labels - Translation labels for tooltip columns
 */
const ChannelTooltip = ({ active, payload, label, activeChannel, isMonthlyView, labels = {} }) => {
  if (!active || !payload?.length) return null;

  const dateLabel = getTooltipLabel(label, isMonthlyView);

  const tooltipColumns = [
    { label: labels.email || 'Email', field: 'email' },
    { label: labels.zalo || 'Zalo', field: 'zalo' },
    { label: labels.zaloGroup || 'Zalo Group', field: 'zaloGroup' },
  ];

  // Build a lookup map: dataKey → recharts entry (value + color)
  const dataMap = Object.fromEntries(payload.map((e) => [e.dataKey, e]));

  const getSent = (denomKey) => dataMap[denomKey]?.value || 0;

  /**
   * Single metric row.
   * - compact=true (column mode): grid layout [name | number | %] for strict column alignment.
   * - compact=false (list mode): flex justify-between for normal vertical list.
   */
  const MetricRow = ({ dataKey, name, color, value, compact = false }) => {
    const denomKey = RATIO_DENOMINATOR[dataKey];
    const ratio = denomKey ? calcRatio(value, getSent(denomKey)) : null;

    if (compact) {
      return (
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-1.5 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-xs text-gray-600 whitespace-nowrap">{name}</span>
          </div>
          <span className="text-xs font-semibold text-gray-900 text-right tabular-nums">
            {Number(value || 0).toLocaleString('vi-VN')}
          </span>
          <span className="text-xs font-medium text-indigo-400 w-10 text-right tabular-nums">
            {ratio ?? ''}
          </span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs text-gray-600 whitespace-nowrap">{name}</span>
        </div>
        <span className="text-xs font-semibold text-gray-900 text-right tabular-nums">
          {Number(value || 0).toLocaleString('vi-VN')}
        </span>
        <span className="text-xs font-medium text-indigo-400 w-10 text-right tabular-nums">
          {ratio ?? ''}
        </span>
      </div>
    );
  };

  /* ── "Tất cả" → 3-column layout, rows aligned by metric type ── */
  if (activeChannel === 'all') {
    /** Render one metric cell; if dataKey is null render a same-height empty spacer */
    const ChannelCell = ({ dataKey }) => {
      if (!dataKey) return <div className="h-[22px]" />;
      const entry = dataMap[dataKey];
      if (!entry) return <div className="h-[22px]" />;
      return (
        <MetricRow
          dataKey={dataKey}
          name={stripChannelSuffix(entry.name)}
          color={entry.color}
          value={entry.value}
          compact
        />
      );
    };

    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-3">{dateLabel}</p>
        <div className="flex divide-x divide-gray-100">
          {tooltipColumns.map((col, colIdx) => (
            <div
              key={col.label}
              className={`min-w-[130px] ${colIdx > 0 ? 'pl-3' : ''} ${colIdx < tooltipColumns.length - 1 ? 'pr-3' : ''}`}
            >
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                {col.label}
              </p>
              {TOOLTIP_METRIC_ROWS.map((row, rowIdx) => (
                <ChannelCell key={rowIdx} dataKey={row[col.field]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Single-channel → vertical list ── */
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 min-w-[220px]">
      <p className="text-xs font-semibold text-gray-500 mb-2">{dateLabel}</p>
      {payload.map((entry) => (
        <MetricRow
          key={entry.dataKey}
          dataKey={entry.dataKey}
          name={entry.name}
          color={entry.color}
          value={entry.value}
        />
      ))}
    </div>
  );
};

/**
 * Build chart line config based on active channel.
 * Each channel shows its sent count + engagement metrics + its own order breakdown.
 *
 * @param {'all'|'email'|'zalo'|'zalo_group'} activeChannel
 * @returns {Array<{key: string, name: string, color: string}>}
 */
const buildChartConfig = (activeChannel) => {
  if (activeChannel === 'email') {
    return [
      { key: 'emailSent', name: 'Gửi (Email)', color: '#06b6d4' },
      { key: 'emailOpened', name: 'Mở (Email)', color: '#0ea5e9' },
      { key: 'emailClicked', name: 'Click (Email)', color: '#6366f1' },
      { key: 'emailDownloads', name: 'Tải tệp (Email)', color: '#f59e0b' },
      { key: 'emailPendingOrders', name: 'Đơn chờ (Email)', color: '#fb923c' },
      { key: 'emailCompletedOrders', name: 'Đơn đặt (Email)', color: '#22c55e' },
    ];
  }
  if (activeChannel === 'zalo') {
    return [
      { key: 'zaloSent', name: 'Gửi (Zalo)', color: '#2563eb' },
      { key: 'zaloClicks', name: 'Click (Zalo)', color: '#3b82f6' },
      { key: 'zaloPendingOrders', name: 'Đơn chờ (Zalo)', color: '#fb923c' },
      { key: 'zaloCompletedOrders', name: 'Đơn đặt (Zalo)', color: '#22c55e' },
    ];
  }
  if (activeChannel === 'zalo_group') {
    return [
      { key: 'zaloGroupSent', name: 'Gửi (Zalo Group)', color: '#7c3aed' },
      { key: 'zaloGroupClicks', name: 'Click (Zalo Group)', color: '#8b5cf6' },
      { key: 'zaloGroupPendingOrders', name: 'Đơn chờ (Zalo Group)', color: '#fb923c' },
      { key: 'zaloGroupCompletedOrders', name: 'Đơn đặt (Zalo Group)', color: '#22c55e' },
    ];
  }
  // All channels — show sent + engagement metrics (orders are in the dedicated chart)
  return [
    { key: 'emailSent', name: 'Gửi (Email)', color: '#06b6d4' },
    { key: 'emailOpened', name: 'Mở (Email)', color: '#0ea5e9' },
    { key: 'emailClicked', name: 'Click (Email)', color: '#6366f1' },
    { key: 'emailDownloads', name: 'Tải tệp (Email)', color: '#f59e0b' },
    { key: 'zaloSent', name: 'Gửi (Zalo)', color: '#2563eb' },
    { key: 'zaloClicks', name: 'Click (Zalo)', color: '#3b82f6' },
    { key: 'zaloGroupSent', name: 'Gửi (Zalo Group)', color: '#7c3aed' },
    { key: 'zaloGroupClicks', name: 'Click (Zalo Group)', color: '#8b5cf6' },
  ];
};

/**
 * Channel engagement chart with per-channel order breakdown.
 *
 * Tabs: Tất cả | Email | Zalo | Zalo Group
 * - "Tất cả" shows engagement metrics across all channels
 * - Each channel tab shows channel-specific metrics + that channel's order data
 *
 * @param {object}  props
 * @param {'all'|'email'|'zalo'|'zalo_group'} props.activeChannel
 * @param {function} props.onChangeChannel
 * @param {object}  props.analytics
 * @param {boolean} props.isMonthlyView - Aggregate to monthly + use month-year axis when true
 * @param {string}  [props.insightText] - Insight hiển thị dưới biểu đồ
 * @param {boolean} [props.isInsightLoading]
 * @param {string}  [props.insightError]
 * @returns {JSX.Element}
 */
const DashboardChannelTabs = ({
  activeChannel,
  onChangeChannel,
  analytics,
  isMonthlyView = false,
  insightText = '',
  isInsightLoading = false,
  insightError = '',
}) => {
  const t = useI18n('dashboardChannelTabs');

  const rawTimeline = analytics?.timeline || [];
  const timeline = isMonthlyView ? aggregateToMonthly(rawTimeline) : rawTimeline;

  const chartConfig = useMemo(() => buildChartConfig(activeChannel), [activeChannel]);

  const hasData = timeline.some((item) =>
    chartConfig.some((cfg) => (item[cfg.key] || 0) > 0)
  );

  const chartTitle = {
    all: t('interactionByChannel'),
    email: t('emailEffectivenessOrders'),
    zalo: t('zaloEffectivenessOrders'),
    zalo_group: t('zaloGroupEffectivenessOrders'),
  }[activeChannel] || '';

  const tooltipLabels = {
    email: t('email'),
    zalo: t('zalo'),
    zaloGroup: t('zaloGroup'),
  };

  return (
    <div className="card p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{chartTitle}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {activeChannel === 'all'
              ? t('selectChannelForOrders')
              : t('interactionOrdersForChannel')}
          </p>
        </div>

        {/* Channel tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100 shrink-0">
          {[
            { id: 'all', label: t('all'), color: 'gray' },
            { id: 'email', label: t('email'), color: 'sky' },
            { id: 'zalo', label: t('zalo'), color: 'blue' },
            { id: 'zalo_group', label: t('zaloGroup'), color: 'purple' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-base ${
                activeChannel === item.id
                  ? CHANNEL_TAB_STYLES[item.color]
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/70'
              }`}
              onClick={() => onChangeChannel(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {!hasData ? (
        <div className="h-72 flex flex-col items-center justify-center gap-3 text-gray-400">
          <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <p className="text-sm">{t('noDataForChannel')}</p>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={getAxisFormatter(isMonthlyView)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v > 999 ? `${(v / 1000).toFixed(1)}k` : v}
              />
              <Tooltip content={<ChannelTooltip activeChannel={activeChannel} isMonthlyView={isMonthlyView} labels={tooltipLabels} />} />
              <Legend content={DashboardRechartsLegend} wrapperStyle={{ width: '100%' }} />
              {chartConfig.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: line.color, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <DashboardInsightBlock
        title={t('channelTabs.insightByChannel', { defaultValue: 'Insight · Tương tác theo kênh' })}
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
    </div>
  );
};

export default DashboardChannelTabs;
