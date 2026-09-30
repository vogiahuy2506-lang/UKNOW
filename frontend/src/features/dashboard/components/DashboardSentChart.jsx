import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../../../i18n';
import { aggregateToMonthly, formatMonthAxis, formatMonthTooltip } from '../utils/timelineUtils';
import DashboardInsightBlock from './DashboardInsightBlock';
import DashboardRechartsLegend from './DashboardRechartsLegend';

/** Kênh vẽ trên biểu đồ (thứ tự xếp chồng). Lời mời kết bạn Zalo không nằm trong chuỗi — không phải "tin". */
const CHANNEL_SERIES = [
  { key: 'email', color: '#06b6d4' },
  { key: 'zalo_personal', color: '#2563eb' },
  { key: 'zalo_group', color: '#7c3aed' },
  { key: 'telegram', color: '#f59e0b' },
  { key: 'whatsapp', color: '#16a34a' },
];

const formatAxisDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

const formatTooltipDate = (value, locale = 'vi') => {
  const date = new Date(`${value}T00:00:00`);
  return locale === 'en'
    ? `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
    : `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const SentTooltip = ({ active, payload, label, isMonthlyView, locale, totalLabel }) => {
  if (!active || !payload?.length) return null;
  const dateLabel = isMonthlyView ? formatMonthTooltip(label, locale) : formatTooltipDate(label, locale);
  const fmt = (value) => Number(value || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
  const rows = payload.filter((entry) => Number(entry.value) > 0);
  const total = payload.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-500 mb-2">{dateLabel}</p>
      {rows.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-xs text-gray-600">{entry.name}</span>
          </div>
          <span className="text-xs font-semibold text-gray-900 tabular-nums">{fmt(entry.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-700">{totalLabel}</span>
        <span className="text-xs font-bold text-gray-900 tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
};

/**
 * Biểu đồ "Đã gửi mỗi ngày": cột chồng theo kênh, MỘT chuỗi từ `/dashboard/analytics` → `dailySent`
 * (mỗi ngày `{ date, total, <kênh>: n }`, ngày theo giờ VN, đủ mọi ngày trong khoảng). Chỉ vẽ kênh có tin trong khoảng.
 *
 * @param {object}  props
 * @param {Array}   props.dailySent
 * @param {boolean} [props.isMonthlyView] - Gộp theo tháng khi khoảng ngày chọn theo tháng
 * @param {string}  [props.insightText] - Insight hiển thị dưới biểu đồ
 * @param {boolean} [props.isInsightLoading]
 * @param {string}  [props.insightError]
 * @returns {JSX.Element}
 */
const DashboardSentChart = ({
  dailySent = [],
  isMonthlyView = false,
  insightText = '',
  isInsightLoading = false,
  insightError = '',
}) => {
  const { t, locale } = useI18n();

  const data = useMemo(
    () => (isMonthlyView ? aggregateToMonthly(dailySent) : dailySent),
    [dailySent, isMonthlyView]
  );
  const visibleSeries = useMemo(
    () => CHANNEL_SERIES.filter((series) => dailySent.some((row) => Number(row[series.key] || 0) > 0)),
    [dailySent]
  );
  const hasData = visibleSeries.length > 0;

  return (
    <div className="card p-5 md:p-6" data-testid="dashboard-sent-chart">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-gray-900">{t('dashboardReport.chart.title')}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{t('dashboardReport.chart.subtitle')}</p>
      </div>

      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
          <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">{t('dashboardReport.chart.empty')}</p>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
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
                allowDecimals={false}
                tickFormatter={(v) => (v > 999 ? `${(v / 1000).toFixed(1)}k` : v)}
              />
              <Tooltip
                content={(
                  <SentTooltip
                    isMonthlyView={isMonthlyView}
                    locale={locale}
                    totalLabel={t('dashboardReport.chart.total')}
                  />
                )}
              />
              <Legend content={DashboardRechartsLegend} wrapperStyle={{ width: '100%' }} />
              {visibleSeries.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={t(`dashboardReport.channel.${series.key}`)}
                  stackId="sent"
                  fill={series.color}
                  maxBarSize={36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DashboardInsightBlock
        title={t('dashboardReport.chart.insightTitle')}
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
    </div>
  );
};

export default DashboardSentChart;
