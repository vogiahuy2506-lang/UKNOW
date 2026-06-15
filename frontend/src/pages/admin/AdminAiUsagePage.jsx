import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineCash,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineTrendingUp,
  HiOutlineUsers,
} from 'react-icons/hi';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import adminAiUsageApiService from '../../features/admin/services/adminAiUsageApi.service';
import { useI18n } from '../../i18n';

const windowOptions = [7, 30, 90];

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');
const fmtUsd = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const fmtPct = (value) => (value === null || value === undefined ? '-' : `${Number(value || 0).toFixed(1)}%`);
const featureLabel = (feature) => String(feature || '_unknown').replaceAll('_', ' ');

const KpiCard = ({ icon: Icon, label, value, sub, tone = 'orange' }) => {
  const toneMap = {
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-3 ${toneMap[tone] || toneMap.orange}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{label}</p>
      <p className="text-orange-600">{t('adminAiUsage.totalTokens')}: <strong>{fmt(row.totalTokens)}</strong></p>
      <p className="text-gray-500">{t('adminAiUsage.estimatedCost')}: <strong>{fmtUsd(row.estimatedCostUsd)}</strong></p>
    </div>
  );
};

const SectionHeader = ({ title, hint }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  </div>
);

const EmptyRow = ({ colSpan, text }) => (
  <tr>
    <td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-gray-400">{text}</td>
  </tr>
);

export default function AdminAiUsagePage() {
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await adminAiUsageApiService.getOverview(windowDays);
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('adminAiUsage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, windowDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = data?.summary || {};
  const timeline = useMemo(() => data?.timeline || [], [data]);
  const byPlan = data?.byPlan || [];
  const byFeature = data?.byFeature || [];
  const topUsers = data?.topUsers || [];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminAiUsage.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminAiUsage.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            {windowOptions.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${windowDays === days ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {t('adminAiUsage.days', { days })}
              </button>
            ))}
          </div>
          <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
            <HiOutlineRefresh className="mr-2 h-4 w-4" />
            {t('adminAiUsage.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {t('adminAiUsage.costDisclaimer')}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={HiOutlineSparkles} label={t('adminAiUsage.kpi.totalTokens')} value={fmt(summary.totalTokens)} sub={t('adminAiUsage.kpi.promptOutput', { prompt: fmt(summary.promptTokens), output: fmt(summary.outputTokens) })} tone="orange" />
        <KpiCard icon={HiOutlineCash} label={t('adminAiUsage.kpi.estimatedCost')} value={fmtUsd(summary.estimatedCostUsd)} sub={t('adminAiUsage.kpi.estimatedOnly')} tone="green" />
        <KpiCard icon={HiOutlineUsers} label={t('adminAiUsage.kpi.aiUsers')} value={fmt(summary.userCount)} sub={t('adminAiUsage.kpi.logCount', { count: fmt(summary.logCount) })} tone="blue" />
        <KpiCard icon={HiOutlineTrendingUp} label={t('adminAiUsage.kpi.avgPerUser')} value={fmt(summary.userCount > 0 ? Math.round(summary.totalTokens / summary.userCount) : 0)} sub={t('adminAiUsage.kpi.window', { days: data?.windowDays || windowDays })} tone="purple" />
      </div>

      <div className="card p-5">
        <SectionHeader title={t('adminAiUsage.timeline')} hint={t('adminAiUsage.timelineHint')} />
        {timeline.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">{t('adminAiUsage.noData')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={timeline} margin={{ top: 8, right: 18, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip t={t} />} />
              <Line type="monotone" dataKey="totalTokens" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        <div className="card overflow-hidden">
          <div className="p-5">
            <SectionHeader title={t('adminAiUsage.byPlan')} hint={t('adminAiUsage.byPlanHint')} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">{t('adminAiUsage.plan')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.p90User')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.quota')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byPlan.length === 0 && <EmptyRow colSpan={5} text={t('adminAiUsage.noData')} />}
                {byPlan.map((plan) => (
                  <tr key={plan.planId || plan.planCode} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{plan.planName}</p>
                      <p className="text-xs text-gray-400">{plan.planCode} · {t('adminAiUsage.users', { count: fmt(plan.userCount) })}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-900">{fmt(plan.totalTokens)}</td>
                    <td className="px-5 py-4">{fmtUsd(plan.estimatedCostUsd)}</td>
                    <td className="px-5 py-4">{fmt(plan.p90UserTokens)}</td>
                    <td className="px-5 py-4">
                      <p>{plan.aiTokensPerPeriod > 0 ? fmt(plan.aiTokensPerPeriod) : t('adminAiUsage.unlimited')}</p>
                      <p className="text-xs text-gray-400">{fmtPct(plan.quotaUsagePctAtP90)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-5">
            <SectionHeader title={t('adminAiUsage.byFeature')} hint={t('adminAiUsage.byFeatureHint')} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">{t('adminAiUsage.feature')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                  <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byFeature.length === 0 && <EmptyRow colSpan={3} text={t('adminAiUsage.noData')} />}
                {byFeature.map((feature) => (
                  <tr key={feature.feature} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900 capitalize">{featureLabel(feature.feature)}</p>
                      <p className="text-xs text-gray-400">{t('adminAiUsage.users', { count: fmt(feature.userCount) })}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-900">{fmt(feature.totalTokens)}</td>
                    <td className="px-5 py-4">{fmtUsd(feature.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5">
          <SectionHeader title={t('adminAiUsage.topUsers')} hint={t('adminAiUsage.topUsersHint')} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">{t('adminAiUsage.user')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.plan')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.promptOutput')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topUsers.length === 0 && <EmptyRow colSpan={5} text={t('adminAiUsage.noData')} />}
              {topUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{user.email}</p>
                    <p className="text-xs text-gray-400">ID {user.userId}</p>
                  </td>
                  <td className="px-5 py-4">{user.planCode}</td>
                  <td className="px-5 py-4 font-semibold text-gray-900">{fmt(user.totalTokens)}</td>
                  <td className="px-5 py-4 text-gray-500">{fmt(user.promptTokens)} / {fmt(user.outputTokens)}</td>
                  <td className="px-5 py-4">{fmtUsd(user.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
