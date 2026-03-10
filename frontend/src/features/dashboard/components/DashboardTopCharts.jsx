import { useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useIsMobile from '../../../hooks/useIsMobile';

const CHANNEL_COLOR = {
  email: '#6366f1',
  zalo: '#0ea5e9',
  zalo_group: '#8b5cf6',
};

const COLOR_PENDING = '#f97316';
const COLOR_COMPLETED = '#22c55e';
const COLOR_CLICK = '#6366f1';

const formatNumber = (v) => Number(v || 0).toLocaleString('vi-VN');

/** Hide label when value is zero */
const formatLabelNonZero = (v) => (v > 0 ? formatNumber(v) : '');

/** Truncate label to fit inside Y-axis width */
const truncateLabel = (label, max = 42) =>
  typeof label === 'string' && label.length > max ? `${label.slice(0, max)}…` : label;

/**
 * Sort data descending by sortKey (highest item first = renders at top in Recharts vertical layout).
 *
 * @param {object[]} data
 * @param {string} sortKey
 * @returns {object[]}
 */
const sortDescForChart = (data, sortKey) =>
  [...data].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));

/**
 * Tooltip for two-bar order charts (pending + completed).
 */
const OrderTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const realName = payload[0]?.payload?._realName || '';
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[170px] max-w-[240px]">
      <p className="font-semibold text-gray-700 mb-1.5 leading-snug">{realName}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.fill }} />
            <span className="text-gray-500">{entry.name}</span>
          </span>
          <span className="font-medium text-gray-800">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Tooltip for single-bar click chart.
 */
const ClickTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const realName = payload[0]?.payload?._realName || '';
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[150px] max-w-[230px]">
      <p className="font-semibold text-gray-700 mb-1.5 leading-snug">{realName}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR_CLICK }} />
          <span className="text-gray-500">Clicks</span>
        </span>
        <span className="font-medium text-gray-800">{formatNumber(payload[0]?.value)}</span>
      </div>
    </div>
  );
};

/**
 * Sort toggle control — switches between two sort options.
 *
 * @param {object} props
 * @param {string} props.active - active option key
 * @param {{ key: string, label: string, color: string }[]} props.options
 * @param {function} props.onChange
 */
const SortToggle = ({ active, options, onChange }) => (
  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
    {options.map((opt) => (
      <button
        key={opt.key}
        onClick={() => onChange(opt.key)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          active === opt.key
            ? 'bg-white shadow-sm text-gray-800'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
        {opt.label}
      </button>
    ))}
  </div>
);

/**
 * Horizontal bar chart for a ranked list.
 *
 * Supports optional sort toggle for order charts.
 * Data is sorted descending (highest at top) and "0" labels are hidden.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {object[]} props.data - raw data array from API
 * @param {string} props.nameKey - field name for Y-axis label (full text)
 * @param {{ key: string, name: string, color: string }[]} props.bars - bar series config
 * @param {boolean} [props.sortable] - show sort toggle (for order charts)
 * @param {{ key: string, label: string, color: string }[]} [props.sortOptions] - sort option list
 * @param {string} [props.defaultSortKey] - default field to sort by
 * @param {boolean} [props.showChannelCell] - color each bar cell by campaignType
 * @returns {JSX.Element}
 */
const TopHorizontalChart = ({
  title,
  subtitle,
  data,
  nameKey,
  bars,
  sortable = false,
  sortOptions = [],
  defaultSortKey,
  showChannelCell = false,
}) => {
  const [sortKey, setSortKey] = useState(defaultSortKey || bars[0]?.key || 'total');
  const isMobile = useIsMobile();

  // Y-axis label width and truncation limit depend on viewport
  const yAxisWidth = isMobile ? 120 : 260;
  const labelMaxChars = isMobile ? 16 : 42;
  const chartMarginRight = isMobile ? 36 : 48;

  if (!data || data.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center justify-center h-32 text-xs text-gray-400">
          Không có dữ liệu trong khoảng thời gian này
        </div>
      </div>
    );
  }

  // Sort descending then reverse so recharts renders highest item at top
  const chartData = sortDescForChart(data, sortKey).map((item) => ({
    ...item,
    _label: truncateLabel(item[nameKey], labelMaxChars),
    _realName: item[nameKey] || '',
  }));

  const BAR_HEIGHT = 32;
  const BAR_GAP = 6;
  const chartHeight = Math.max(180, chartData.length * (BAR_HEIGHT * bars.length + BAR_GAP + 8) + 24);

  const isMultiBar = bars.length > 1;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {sortable && sortOptions.length > 0 && (
          <SortToggle active={sortKey} options={sortOptions} onChange={setSortKey} />
        )}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: chartMarginRight, left: 8, bottom: 0 }}
          barGap={3}
          barCategoryGap="20%"
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="_label"
            tick={{ fontSize: isMobile ? 11 : 12, fill: '#374151' }}
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
          />
          <Tooltip
            cursor={{ fill: '#f3f4f6' }}
            content={isMultiBar ? <OrderTooltip /> : <ClickTooltip />}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name}
              fill={bar.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={BAR_HEIGHT}
            >
              {/* Hide "0" labels; show value to the right only for non-zero */}
              <LabelList
                dataKey={bar.key}
                position="right"
                style={{ fontSize: 11, fill: '#6b7280' }}
                formatter={isMultiBar ? formatLabelNonZero : formatNumber}
              />
              {showChannelCell && chartData.map((entry, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={CHANNEL_COLOR[entry.campaignType] || bar.color}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Legend for multi-bar charts */}
      {isMultiBar && (
        <div className="flex items-center gap-4 mt-2 justify-end">
          {bars.map((bar) => (
            <span key={bar.key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: bar.color }} />
              {bar.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const ORDER_BARS = [
  { key: 'pendingCount',   name: 'Đơn chờ', color: COLOR_PENDING },
  { key: 'completedCount', name: 'Đã mua',  color: COLOR_COMPLETED },
];

const ORDER_SORT_OPTIONS = [
  { key: 'completedCount', label: 'Đã mua',  color: COLOR_COMPLETED },
  { key: 'pendingCount',   label: 'Đơn chờ', color: COLOR_PENDING },
];

const CLICK_BARS = [
  { key: 'clickCount', name: 'Clicks', color: COLOR_CLICK },
];

/**
 * Dashboard section: 3 horizontal bar charts for top ranked lists.
 *
 * - Top 5 courses/products ranked by orders (with sort toggle)
 * - Top 5 campaigns ranked by orders (with sort toggle)
 * - Top 5 campaigns ranked by clicks (descending, high → low)
 *
 * @param {object} props
 * @param {object} props.topListsData - { topCourses, topCampaignsByOrders, topCampaignsByClicks }
 * @returns {JSX.Element}
 */
const DashboardTopCharts = ({ topListsData }) => {
  const topCourses = topListsData?.topCourses || [];
  const topCampaignsByOrders = topListsData?.topCampaignsByOrders || [];
  const topCampaignsByClicks = topListsData?.topCampaignsByClicks || [];

  return (
    <div className="space-y-4">
      {/* Top courses — full width */}
      <TopHorizontalChart
        title="Top khóa học có nhiều đơn"
        subtitle="Top 5"
        data={topCourses}
        nameKey="productName"
        bars={ORDER_BARS}
        sortable
        sortOptions={ORDER_SORT_OPTIONS}
        defaultSortKey="completedCount"
      />

      {/* Top campaigns by orders + top campaigns by clicks */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TopHorizontalChart
          title="Top chiến dịch có nhiều đơn"
          subtitle="Top 5"
          data={topCampaignsByOrders}
          nameKey="campaignName"
          bars={ORDER_BARS}
          sortable
          sortOptions={ORDER_SORT_OPTIONS}
          defaultSortKey="completedCount"
        />
        <TopHorizontalChart
          title="Top chiến dịch có nhiều click"
          subtitle="Top 5 · Email clicked + Zalo clicked từ hành trình"
          data={topCampaignsByClicks}
          nameKey="campaignName"
          bars={CLICK_BARS}
          defaultSortKey="clickCount"
          showChannelCell
        />
      </div>
    </div>
  );
};

export default DashboardTopCharts;
