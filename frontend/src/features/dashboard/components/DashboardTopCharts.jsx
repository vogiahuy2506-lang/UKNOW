import { useMemo, useState } from 'react';
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
import DashboardInsightBlock from './DashboardInsightBlock';

const CHANNEL_COLOR = {
  email: '#6366f1',
  zalo: '#0ea5e9',
  zalo_group: '#8b5cf6',
};

/** Nhãn kênh chiến dịch (tooltip / trục Y) */
const CAMPAIGN_CHANNEL_LABEL = {
  email: 'Email',
  zalo: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
};

/** Tên ngắn trên trục Y kèm tên chiến dịch */
const CAMPAIGN_CHANNEL_SHORT = {
  email: 'Email',
  zalo: 'Zalo',
  zalo_group: 'Zalo nhóm',
};

/**
 * Trả về nhãn kênh đầy đủ theo `campaignType` từ API.
 *
 * @param {string} [type]
 * @returns {string}
 */
const getCampaignChannelLabel = (type) =>
  CAMPAIGN_CHANNEL_LABEL[type] || 'Không xác định';

/**
 * Tên kênh ngắn (gắn sau tên chiến dịch trên trục dọc).
 *
 * @param {string} [type]
 * @returns {string}
 */
const getCampaignChannelShort = (type) => CAMPAIGN_CHANNEL_SHORT[type] || '';

const COLOR_PENDING = '#f97316';
const COLOR_COMPLETED = '#22c55e';
const COLOR_CLICK = '#6366f1';
/** Màu thanh “Đã gửi” trong biểu đồ Top click (tách khỏi click) */
const COLOR_SENT = '#0d9488';

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
 * Tooltip cho biểu đồ Top chiến dịch: 2 thanh số (click + đã gửi) và tỷ lệ click trong tổng tin gửi.
 * Mở (open) chỉ có trên hành trình email; Zalo không có mở — vẫn hiển thị mở = 0 khi cần.
 */
const CampaignClickSentTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const realName = row._realName || '';
  const channelLabel = row._channelLabel || getCampaignChannelLabel(row.campaignType);
  const sent = Number(row.sentCount || 0);
  const clicks = Number(row.clickCount || 0);
  const opens = Number(row.openCount || 0);
  const ratePct =
    sent > 0 ? Math.round((clicks / sent) * 10000) / 100 : Number(row.clickRatePct || 0);
  const isEmail = row.campaignType === 'email';

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[200px] max-w-[280px]">
      <p className="font-semibold text-gray-700 mb-0.5 leading-snug">{realName}</p>
      <p className="text-[11px] text-gray-600 mb-1.5">
        Kênh: <span className="font-semibold text-gray-800">{channelLabel}</span>
      </p>
      <p className="text-[11px] text-indigo-600 font-medium mb-1.5">
        Tỷ lệ click / gửi: {ratePct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
        {sent === 0 ? ' (chưa có tin gửi)' : ''}
      </p>
      <p className="text-[11px] text-gray-400 mb-2">
        {isEmail ? (
          <>Mở email (hành trình): {formatNumber(opens)}</>
        ) : (
          <>Mở email: không áp dụng — chỉ chiến dịch Email mới có sự kiện mở.</>
        )}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.fill }} />
            <span className="text-gray-500">{entry.name}</span>
          </span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Gắn thêm tỷ lệ % từ API (click, mở, gửi) để vẽ nhãn + tooltip; biểu đồ dùng clickCount/sentCount.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
const mapCampaignsToRates = (rows) =>
  (rows || []).map((row) => {
    const sent = Number(row.sentCount || 0);
    const clicks = Number(row.clickCount || 0);
    const opens = Number(row.openCount ?? 0);
    const clickRatePct = sent > 0 ? Math.round((clicks / sent) * 10000) / 100 : 0;
    const openRatePct = sent > 0 ? Math.round((opens / sent) * 10000) / 100 : 0;
    return { ...row, clickRatePct, openRatePct };
  });

/**
 * Chỉ dùng cho thanh «Đã gửi»: vạch trắng dọc trong thanh để phân biệt với thanh click (trơn).
 *
 * Luồng:
 * 1. Vẽ nền màu theo kênh (fill).
 * 2. Phủ các đường trắng dọc mờ, cách đều theo chiều width.
 *
 * @param {object} props - props từ Recharts `Bar` shape (layout ngang: x,y,width,height,fill)
 * @returns {JSX.Element|null}
 */
const CampaignSentStripedBarShape = (props) => {
  const { fill, x, y, width, height } = props;
  const w = Number(width);
  const h = Number(height);
  const bx = Number(x);
  const by = Number(y);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  const rx = 4;
  const step = 7;
  const lines = [];
  for (let cx = bx + step; cx < bx + w - rx; cx += step) {
    lines.push(
      <line
        key={cx}
        x1={cx}
        y1={by}
        x2={cx}
        y2={by + h}
        stroke="rgba(255,255,255,0.42)"
        strokeWidth={1.25}
      />
    );
  }

  return (
    <g>
      <rect x={bx} y={by} width={w} height={h} fill={fill} rx={rx} ry={rx} />
      {lines}
    </g>
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
 * @param {string} [props.insightText] - insight hiển thị dưới chart
 * @param {boolean} [props.isInsightLoading]
 * @param {'default'|'campaignClickSent'} [props.chartKind] - campaignClickSent: 2 thanh số (click + đã gửi), cùng thang; nhãn có % click/gửi
 * @param {string} [props.insightError]
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
  chartKind = 'default',
  insightText = '',
  isInsightLoading = false,
  insightError = '',
}) => {
  const [sortKey, setSortKey] = useState(defaultSortKey || bars[0]?.key || 'total');
  const isMobile = useIsMobile();

  // Y-axis label width and truncation limit depend on viewport
  const yAxisWidth = isMobile ? 120 : 260;
  const labelMaxChars = isMobile ? 16 : 42;
  const isCampaignClickSentChart = chartKind === 'campaignClickSent';

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
  const chartData = sortDescForChart(data, sortKey).map((item) => {
    const baseName = item[nameKey] || '';
    const channelShort = getCampaignChannelShort(item.campaignType);
    const labelWithChannel =
      isCampaignClickSentChart && channelShort
        ? `${baseName} · ${channelShort}`
        : baseName;
    return {
      ...item,
      _label: truncateLabel(labelWithChannel, labelMaxChars),
      _realName: baseName,
      _channelLabel: isCampaignClickSentChart ? getCampaignChannelLabel(item.campaignType) : '',
    };
  });

  const BAR_HEIGHT = 32;
  const BAR_GAP = 6;
  const chartHeight = Math.max(180, chartData.length * (BAR_HEIGHT * bars.length + BAR_GAP + 8) + 24);

  const isMultiBar = bars.length > 1;

  /** Trục X: cùng thang cho click và gửi (số nguyên, có padding) */
  const countAxisMax = (() => {
    if (!isCampaignClickSentChart || !chartData.length) return 100;
    const vals = chartData.flatMap((d) => [Number(d.clickCount) || 0, Number(d.sentCount) || 0]);
    const m = Math.max(1, ...vals);
    return Math.ceil(m * 1.05);
  })();

  const chartMarginRight = isMobile ? 40 : 52;

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
            domain={isCampaignClickSentChart ? [0, countAxisMax] : undefined}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={!isCampaignClickSentChart}
            tickFormatter={isCampaignClickSentChart ? (v) => formatNumber(v) : undefined}
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
            content={isCampaignClickSentChart ? <CampaignClickSentTooltip /> : <OrderTooltip />}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name}
              fill={bar.color}
              shape={
                isCampaignClickSentChart && bar.key === 'sentCount'
                  ? CampaignSentStripedBarShape
                  : undefined
              }
              radius={
                isCampaignClickSentChart
                  ? bar.key === 'sentCount'
                    ? [0, 0, 0, 0]
                    : [0, 4, 4, 0]
                  : [0, 4, 4, 0]
              }
              maxBarSize={BAR_HEIGHT}
            >
              {isCampaignClickSentChart ? (
                <LabelList
                  dataKey={bar.key}
                  position="right"
                  content={(labelProps) => {
                    const vb = labelProps.viewBox || {};
                    const x = vb.x ?? 0;
                    const y = vb.y ?? 0;
                    const w = vb.width ?? 0;
                    const h = vb.height ?? 0;
                    const payload = labelProps.payload;
                    if (!payload) return null;
                    const cy = y + h / 2;
                    const right = x + w + 6;
                    if (bar.key === 'clickCount') {
                      const v = Number(payload.clickCount || 0);
                      if (v <= 0) return null;
                      const pct = Number(payload.clickRatePct || 0);
                      return (
                        <text
                          x={right}
                          y={cy}
                          dy="0.35em"
                          fill="#6b7280"
                          fontSize={11}
                          textAnchor="start"
                        >
                          {`${formatNumber(v)} · ${pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}
                        </text>
                      );
                    }
                    if (bar.key === 'sentCount') {
                      const v = Number(payload.sentCount || 0);
                      if (v <= 0) return null;
                      return (
                        <text
                          x={right}
                          y={cy}
                          dy="0.35em"
                          fill="#6b7280"
                          fontSize={11}
                          textAnchor="start"
                        >
                          {formatNumber(v)}
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              ) : (
                <LabelList
                  dataKey={bar.key}
                  position="right"
                  style={{ fontSize: 11, fill: '#6b7280' }}
                  formatter={(value) => {
                    if (isMultiBar) return formatLabelNonZero(value);
                    return formatNumber(value);
                  }}
                />
              )}
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

      {/* Legend: Top click — màu theo kênh + mô tả thanh trơn / vạch */}
      {isMultiBar && isCampaignClickSentChart && (
        <div className="mt-2 space-y-2 text-[11px] text-gray-500">
          <p className="text-right leading-relaxed">
            Thanh trên: <span className="font-medium text-gray-700">click</span> — nền trơn, không vạch
            trắng · Thanh dưới: <span className="font-medium text-gray-700">đã gửi</span> — có vạch trắng
            dọc trong thanh. Cùng thang ngang; độ dài = số lượng.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span className="text-gray-400 shrink-0">Màu theo kênh chiến dịch:</span>
            {(['email', 'zalo', 'zalo_group']).map((key) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: CHANNEL_COLOR[key] }}
                />
                {CAMPAIGN_CHANNEL_SHORT[key]}
              </span>
            ))}
          </div>
        </div>
      )}
      {isMultiBar && !isCampaignClickSentChart && (
        <div className="flex items-center gap-4 mt-2 justify-end">
          {bars.map((bar) => (
            <span key={bar.key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: bar.color }} />
              {bar.name}
            </span>
          ))}
        </div>
      )}

      <DashboardInsightBlock
        title="Insight"
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
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

/** Thanh trên: số click; thanh dưới: số tin đã gửi (cùng thang trục); tỷ lệ hiển thị ở nhãn + tooltip */
const CAMPAIGN_CLICK_SENT_BARS = [
  { key: 'clickCount', name: 'Click', color: COLOR_CLICK },
  { key: 'sentCount', name: 'Đã gửi', color: COLOR_SENT },
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
 * @param {object|null} [props.insights]
 * @param {boolean} [props.isInsightLoading]
 * @param {string} [props.insightError]
 * @returns {JSX.Element}
 */
const DashboardTopCharts = ({
  topListsData,
  insights = null,
  isInsightLoading = false,
  insightError = '',
}) => {
  const topCourses = topListsData?.topCourses || [];
  const topCampaignsByOrders = topListsData?.topCampaignsByOrders || [];
  const topCampaignsByClicks = topListsData?.topCampaignsByClicks || [];

  const topCampaignsRate = useMemo(() => mapCampaignsToRates(topCampaignsByClicks), [topCampaignsByClicks]);

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
        insightText={insights?.charts?.topLists?.topCourses || ''}
        isInsightLoading={isInsightLoading}
        insightError={insightError}
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
          insightText={insights?.charts?.topLists?.topCampaignsByOrders || ''}
          isInsightLoading={isInsightLoading}
          insightError={insightError}
        />
        <TopHorizontalChart
          title="Top chiến dịch có nhiều click"
          subtitle="Top 5 · Trục dọc kèm kênh (Email / Zalo / Zalo nhóm). Trên = click (thanh trơn), dưới = đã gửi (có vạch trắng); cùng thang; nhãn có % click/gửi"
          data={topCampaignsRate}
          nameKey="campaignName"
          bars={CAMPAIGN_CLICK_SENT_BARS}
          chartKind="campaignClickSent"
          defaultSortKey="clickCount"
          showChannelCell
          insightText={insights?.charts?.topLists?.topCampaignsByClicks || ''}
          isInsightLoading={isInsightLoading}
          insightError={insightError}
        />
      </div>
    </div>
  );
};

export default DashboardTopCharts;
