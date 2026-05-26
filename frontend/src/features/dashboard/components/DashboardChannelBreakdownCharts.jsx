import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useI18n } from '../../../i18n';
import DashboardInsightBlock from './DashboardInsightBlock';

const CHANNEL_COLORS = {
  email: '#6366f1',
  zalo: '#0ea5e9',
  zalo_group: '#8b5cf6',
};

const formatNumber = (v) => Number(v || 0).toLocaleString('vi-VN');

/**
 * Get channel label from translation function
 */
const getChannelLabel = (key, t) => {
  const labels = {
    email: t('channelBreakdown.channelEmail') || 'Email',
    zalo: t('channelBreakdown.channelZalo') || 'Zalo',
    zalo_group: t('channelBreakdown.channelZaloGroup') || 'Zalo Group',
  };
  return labels[key] || key;
};

/**
 * Custom tooltip for donut charts.
 */
const DonutTooltip = ({ active, payload, t }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const channelKey = payload[0]?.payload?.key;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs min-w-[120px]">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: CHANNEL_COLORS[channelKey] || '#9ca3af' }}
        />
        <span className="font-medium text-gray-700">{name}</span>
      </div>
      <div className="text-gray-500 pl-3.5">{formatNumber(value)}</div>
    </div>
  );
};

/**
 * Build chart data from three channel values.
 *
 * Filters out zero-value channels so the donut doesn't render ghost slices.
 *
 * @param {{ email: number, zalo: number, zalo_group: number }} values
 * @param {function} t - Translation function
 * @returns {{ key: string, name: string, value: number, color: string }[]}
 */
const buildChartData = (values, t) =>
  Object.entries(values)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      key,
      name: getChannelLabel(key, t),
      value,
      color: CHANNEL_COLORS[key] || '#9ca3af',
    }));

/**
 * Single donut chart card.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {{ email: number, zalo: number, zalo_group: number }} props.values
 * @param {string} props.accentColor - color for the total label in the donut center
 * @param {string} [props.insightText]
 * @param {boolean} [props.isInsightLoading]
 * @param {string} [props.insightError]
 */
const DonutCard = ({
  title,
  values,
  accentColor,
  insightText = '',
  isInsightLoading = false,
  insightError = '',
}) => {
  const { t } = useI18n();
  const data = buildChartData(values, t);
  const total = Object.values(values).reduce((sum, v) => sum + v, 0);

  return (
    <div className="card p-5 flex flex-col">
      <p className="text-sm font-semibold text-gray-700 mb-4">{title}</p>

      {total === 0 ? (
        <div className="flex items-center justify-center flex-1 h-32 text-xs text-gray-400">
          {t('channelBreakdown.noDataInRange')}
        </div>
      ) : (
        <>
          {/* Donut chart — center label rendered as SVG to avoid tooltip overlap */}
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={75}
                paddingAngle={data.length > 1 ? 3 : 0}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    const { cx, cy } = viewBox;
                    return (
                      <g>
                        <text
                          x={cx}
                          y={cy - 10}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fill="#9ca3af"
                        >
                          {t('channelBreakdown.total')}
                        </text>
                        <text
                          x={cx}
                          y={cy + 10}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={18}
                          fontWeight="700"
                          fill={accentColor}
                        >
                          {formatNumber(total)}
                        </text>
                      </g>
                    );
                  }}
                  position="center"
                />
              </Pie>
              <Tooltip content={<DonutTooltip t={t} />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-4 space-y-2">
            {data.map((entry) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
              return (
                <div key={entry.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-gray-400">{pct}%</span>
                    <span className="font-medium text-gray-700 tabular-nums w-14 text-right">
                      {formatNumber(entry.value)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <DashboardInsightBlock
        title={t('dashboardInsightOverview.title')}
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
    </div>
  );
};

/**
 * Dashboard section: 3 donut charts in a horizontal row showing channel composition.
 *
 * Charts:
 *   1. Cơ cấu Click — email clicked + zalo clicked + zalo_group clicked
 *   2. Cơ cấu Đã mua — completed orders by channel
 *   3. Cơ cấu Đơn chờ — pending orders by channel
 *
 * All values come from the overview.channels object.
 *
 * @param {object} props
 * @param {object|null} props.overview - dashboard overview payload from API
 * @param {object|null} [props.insights] - payload insight trả về từ API
 * @param {boolean} [props.isInsightLoading]
 * @param {string} [props.insightError]
 * @param {boolean} [props.oneColumn] true = xếp 3 donut theo cột dọc (bản in PDF)
 * @param {'click'|'completed'|'pending'|null} [props.onlyBreakdownKey] chỉ render một donut (mỗi trang PDF một biểu đồ)
 * @returns {JSX.Element}
 */
const DashboardChannelBreakdownCharts = ({
  overview,
  insights = null,
  isInsightLoading = false,
  insightError = '',
  oneColumn = false,
  onlyBreakdownKey = null,
}) => {
  const { t } = useI18n();
  const channels = overview?.channels || {};
  const journeyEvents = overview?.journeyEvents || {};

  // Click counts sourced from customer_journey table (event_type = email_clicked / zalo_clicked)
  const clickValues = {
    email: Number(journeyEvents.emailClicked || 0),
    zalo: Number(journeyEvents.zaloClicked || 0),
    zalo_group: Number(journeyEvents.zaloGroupClicked || 0),
  };

  const completedValues = {
    email: Number(channels.email?.completedOrderCount || 0),
    zalo: Number(channels.zalo?.completedOrderCount || 0),
    zalo_group: Number(channels.zaloGroup?.completedOrderCount || 0),
  };

  const pendingValues = {
    email: Number(channels.email?.pendingOrderCount || 0),
    zalo: Number(channels.zalo?.pendingOrderCount || 0),
    zalo_group: Number(channels.zaloGroup?.pendingOrderCount || 0),
  };

  const breakdownDefs = [
    {
      id: 'click',
      title: t('channelBreakdown.clickBreakdown'),
      values: clickValues,
      accentColor: '#6366f1',
      insightText: insights?.charts?.channelBreakdown?.click || '',
    },
    {
      id: 'completed',
      title: t('channelBreakdown.completedBreakdown'),
      values: completedValues,
      accentColor: '#22c55e',
      insightText: insights?.charts?.channelBreakdown?.completed || '',
    },
    {
      id: 'pending',
      title: t('channelBreakdown.pendingBreakdown'),
      values: pendingValues,
      accentColor: '#f97316',
      insightText: insights?.charts?.channelBreakdown?.pending || '',
    },
  ];

  const visibleDefs =
    onlyBreakdownKey === 'click' || onlyBreakdownKey === 'completed' || onlyBreakdownKey === 'pending'
      ? breakdownDefs.filter((d) => d.id === onlyBreakdownKey)
      : breakdownDefs;

  return (
    <div className={oneColumn || onlyBreakdownKey ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 sm:grid-cols-3 gap-4'}>
      {visibleDefs.map((d) => (
        <DonutCard
          key={d.id}
          title={d.title}
          values={d.values}
          accentColor={d.accentColor}
          insightText={d.insightText}
          isInsightLoading={isInsightLoading}
          insightError={insightError}
        />
      ))}
    </div>
  );
};

export default DashboardChannelBreakdownCharts;
