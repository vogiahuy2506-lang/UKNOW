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
import DashboardInsightBlock from '../../dashboard/components/DashboardInsightBlock';
import DashboardRechartsLegend from '../../dashboard/components/DashboardRechartsLegend';

const formatN = (v) => Number(v || 0).toLocaleString('vi-VN');

/**
 * Biểu đồ top landing: click tracking vs gửi form — trục X theo tiêu đề CMS (fallback slug).
 *
 * @param {{
 *   rows?: { slug?: string, title?: string, viewCount?: number, clickCount?: number, submitCount?: number }[],
 *   topN?: number,
 *   scopeAllTime?: boolean,
 *   insightText?: string,
 *   isInsightLoading?: boolean,
 *   insightError?: string,
 *   showInsight?: boolean
 * }} props
 */
export default function LandingPagesAdminStatsCharts({
  rows = [],
  topN = 10,
  scopeAllTime = false,
  insightText = '',
  isInsightLoading = false,
  insightError = '',
  showInsight = false,
}) {
  const chartData = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    /** Top landing: ưu tiên tổng tương tác (xem + click + form) để slug /lp chỉ có view vẫn lên biểu đồ. */
    const sorted = [...list].sort((a, b) => {
      const score = (x) =>
        Number(x.viewCount || 0) + Number(x.clickCount || 0) + Number(x.submitCount || 0);
      return score(b) - score(a);
    });
    return sorted.slice(0, topN).map((r) => {
      const slug = String(r.slug || '');
      const titleRaw = String(r.title || '').trim();
      return {
        slug,
        /** Nhãn trục X: ưu tiên title từ API, không có thì slug (slug lạ / không map DB). */
        displayName: titleRaw || slug || '—',
        view: Number(r.viewCount || 0),
        click: Number(r.clickCount || 0),
        form: Number(r.submitCount || 0),
      };
    });
  }, [rows, topN]);

  const insightBlock =
    showInsight ? (
      <DashboardInsightBlock
        title="Insight · Top landing"
        text={insightText}
        isLoading={isInsightLoading}
        error={insightError}
      />
    ) : null;

  if (chartData.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="text-base font-semibold text-gray-900">Top landing (xem, tracking & form)</h3>
        <p className="text-xs text-gray-500 mt-1">
          {scopeAllTime
            ? 'Chưa có dữ liệu (toàn thời gian).'
            : 'Chưa có dữ liệu trong khoảng thời gian đã chọn.'}
        </p>
        {insightBlock}
      </div>
    );
  }

  return (
    <div className="card p-5 overflow-x-auto">
      <h3 className="text-base font-semibold text-gray-900">Top landing (xem, tracking & form)</h3>
      <p className="text-xs text-gray-500 mt-1 mb-4">
        Top {topN} landing theo tổng (lượt xem + click tracking + gửi form)
        {scopeAllTime ? ' — toàn thời gian' : ''}. Nhãn trục ngang là tiêu đề trang; gồm{' '}
        <code className="text-[11px] bg-gray-100 px-1 rounded">/lp/…</code> và landing cố định{' '}
        <code className="text-[11px] bg-gray-100 px-1 rounded">/l</code>.
      </p>
      <div className="h-72 w-full min-w-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {/* Cùng một landing: 3 series kề nhau (barGap 0); khoảng cách chủ yếu giữa các nhóm trục X. */}
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barGap={0}
            barCategoryGap="10%"
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
            <XAxis dataKey="displayName" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={72} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatN(v)} />
            <Tooltip
              formatter={(value, name) => {
                const labelMap = {
                  view: 'Lượt xem',
                  click: 'Click (tracking)',
                  form: 'Gửi form',
                };
                return [formatN(value), labelMap[name] || name];
              }}
              labelFormatter={(label, payload) => {
                const slug = payload?.[0]?.payload?.slug;
                if (slug && String(slug) !== String(label)) {
                  return `Tiêu đề: ${label} (slug: ${slug})`;
                }
                return `Tiêu đề: ${label}`;
              }}
            />
            <Legend content={DashboardRechartsLegend} wrapperStyle={{ width: '100%' }} />
            <Bar dataKey="view" name="Lượt xem" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="click" name="Click (tracking)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="form" name="Gửi form" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {insightBlock}
    </div>
  );
}
